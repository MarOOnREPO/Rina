import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';
import { getPresignedDownloadUrl } from '../services/s3.js';
import { getConfig } from '../services/config.js';
import type { CinemaSource, CinemaTmdbMetadata } from '../types/cinema.js';
import {
  createCinemaSession,
  getSession,
  getPlaylist,
  getSegment,
  destroySession,
  setCinemaMetadata,
  getCinemaMetadata,
  clearCinemaMetadata
} from '../services/cinema.js';

const startBodySchema = z.object({
  type: z.enum(['torrent', 'direct', 'upload']),
  uri: z.string().min(1),
  filename: z.string().optional()
});

const TMDB_TIMEOUT = 8000;

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

function extractNameFromMagnet(uri: string): string | undefined {
  try {
    const url = new URL(uri);
    const dn = url.searchParams.get('dn');
    if (dn) return decodeURIComponent(dn).replace(/\+/g, ' ');
  } catch {
    // ignore
  }
  return undefined;
}

function cleanTitleFromFilename(filename: string): { title: string; year?: string } {
  const base = filename.replace(/\.[^/.]+$/, ''); // remove extension
  // Replace separators with spaces
  let cleaned = base.replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Extract year
  const yearMatch = cleaned.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : undefined;
  // Remove common release tags
  cleaned = cleaned
    .replace(/\b(1080p|720p|480p|2160p|4K|UHD|HDR|HEVC|x264|x265|h264|h265|BluRay|Blu-Ray|BRRip|WEBRip|WEB-DL|HDTV|DVDRip|Cam|TS|Telesync|HDTS|DVDSCR|SCR)\b/gi, '')
    .replace(/\b(EXTENDED|UNRATED|REMASTERED|DIRECTORS CUT|DC|REPACK|PROPER|READNFO)\b/gi, '')
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: cleaned, year };
}

async function fetchTmdbMetadata(filename: string): Promise<CinemaTmdbMetadata | undefined> {
  const apiKey = await getConfig('TMDB_API_KEY');
  if (!apiKey || apiKey.startsWith('your_')) return undefined;

  const { title, year } = cleanTitleFromFilename(filename);
  if (!title) return undefined;

  try {
    const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}&page=1`;
    const movieRes = await fetchWithTimeout(movieUrl, TMDB_TIMEOUT);
    const movieData = (await movieRes.json()) as { results?: Array<Record<string, unknown>> };
    const movie = (movieData.results || [])[0];

    if (movie) {
      const detailRes = await fetchWithTimeout(
        `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${encodeURIComponent(apiKey)}`,
        TMDB_TIMEOUT
      );
      const detail = (await detailRes.json()) as Record<string, unknown>;
      return {
        tmdbId: movie.id as number,
        title: (detail.title || movie.title || title) as string,
        overview: (detail.overview as string | null) ?? null,
        posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w342${detail.poster_path}` : null,
        backdropPath: detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${detail.backdrop_path}` : null,
        releaseDate: (detail.release_date as string | undefined) || (movie.release_date as string | undefined) || null,
        mediaType: 'movie'
      };
    }

    // Fallback to TV search
    const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(title)}${year ? `&first_air_date_year=${year}` : ''}&page=1`;
    const tvRes = await fetchWithTimeout(tvUrl, TMDB_TIMEOUT);
    const tvData = (await tvRes.json()) as { results?: Array<Record<string, unknown>> };
    const tv = (tvData.results || [])[0];

    if (tv) {
      const detailRes = await fetchWithTimeout(
        `https://api.themoviedb.org/3/tv/${tv.id}?api_key=${encodeURIComponent(apiKey)}`,
        TMDB_TIMEOUT
      );
      const detail = (await detailRes.json()) as Record<string, unknown>;
      return {
        tmdbId: tv.id as number,
        title: (detail.name || tv.name || title) as string,
        overview: (detail.overview as string | null) ?? null,
        posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w342${detail.poster_path}` : null,
        backdropPath: detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${detail.backdrop_path}` : null,
        releaseDate: (detail.first_air_date as string | undefined) || (tv.first_air_date as string | undefined) || null,
        mediaType: 'tv'
      };
    }
  } catch (err) {
    console.error('[Cinema TMDB] Error fetching metadata:', (err as Error).message);
  }
  return undefined;
}

export default async function cinemaRoutes(fastify: FastifyInstance) {
  fastify.post('/session', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const parse = startBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parse.error.flatten() });
    }

    try {
      const { type, uri, filename } = parse.data;
      let source: CinemaSource = { type, uri };
      let s3Key: string | undefined;

      if (type === 'upload') {
        s3Key = uri;
        const presignedUrl = await getPresignedDownloadUrl(s3Key, 300);
        source = { type, uri: presignedUrl, s3Key, filename };
      }

      let metadataQuery = filename;
      if (!metadataQuery && type === 'torrent') {
        metadataQuery = extractNameFromMagnet(uri) || undefined;
      }
      const metadata = metadataQuery ? await fetchTmdbMetadata(metadataQuery) : undefined;
      const sessionId = await createCinemaSession(source);
      setCinemaMetadata(sessionId, { filename: metadataQuery, s3Key, metadata });

      const session = (await getSession(sessionId))!;
      return reply.status(201).send({
        id: sessionId,
        status: session.status,
        playlistUrl: `/api/cinema/stream/${sessionId}/playlist.m3u8`,
        source: {
          type: session.source.type,
          filename: session.source.filename,
          s3Key: session.source.s3Key,
          metadata: session.source.metadata
        },
        error: session.error || undefined
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to start session', message: err.message });
    }
  });

  fastify.get('/session/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getSession(id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return reply.send({
      id: session.id,
      status: session.status,
      source: session.source,
      createdAt: session.createdAt,
      error: session.error || undefined
    });
  });

  fastify.get('/stream/:id/playlist.m3u8', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const playlist = await getPlaylist(id);
    if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });
    return reply.header('Content-Type', 'application/vnd.apple.mpegurl').send(playlist);
  });

  fastify.get('/stream/:id/:filename', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { id, filename } = request.params as { id: string; filename: string };
    if (!/\.(m4s|mp4|m3u8)$/i.test(filename)) {
      return reply.status(400).send({ error: 'Invalid file type' });
    }
    const segment = await getSegment(id, filename);
    if (!segment) return reply.status(404).send({ error: 'Segment not found' });
    const ext = filename.split('.').pop()?.toLowerCase();
    const mime = ext === 'm3u8' ? 'application/vnd.apple.mpegurl' : 'video/iso.segment';
    return reply.header('Content-Type', mime).send(segment);
  });

  fastify.get('/session/:id/download', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const meta = getCinemaMetadata(id);
    if (!meta?.s3Key) {
      return reply.status(404).send({ error: 'Download not available for this session' });
    }
    try {
      const url = await getPresignedDownloadUrl(meta.s3Key, 300);
      return reply.send({ url, filename: meta.filename || 'download' });
    } catch (err) {
      return reply.status(500).send({ error: 'Failed to generate download URL' });
    }
  });

  fastify.delete('/session/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await destroySession(id);
    clearCinemaMetadata(id);
    return reply.send({ ok: true });
  });
}
