import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';
import { getPresignedDownloadUrl } from '../services/s3.js';
import { getConfig } from '../services/config.js';
import { prisma } from '../services/prisma.js';
import { cleanTitleFromFilename } from '../utils/cleanTitle.js';
import type { CinemaSource } from '../types/cinema.js';
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

export interface TmdbFullData {
  tmdbId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  mediaType: 'movie' | 'tv';
  cast?: Array<{ name: string; character?: string; profilePath?: string }>;
  trailerKey?: string;
  genres?: string[];
  runtime?: number;
  voteAverage?: number;
  director?: string;
}

async function fetchTmdbFullData(filename: string): Promise<TmdbFullData | undefined> {
  const apiKey = await getConfig('TMDB_API_KEY');
  if (!apiKey || apiKey.startsWith('your_')) return undefined;

  const { title, year, isTv } = cleanTitleFromFilename(filename);
  if (!title) return undefined;

  const searchMediaType = isTv ? 'tv' : 'movie';

  try {
    // Search
    const searchUrl = `https://api.themoviedb.org/3/search/${searchMediaType}?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(title)}${year ? (searchMediaType === 'tv' ? `&first_air_date_year=${year}` : `&year=${year}`) : ''}&page=1`;
    const searchRes = await fetchWithTimeout(searchUrl, TMDB_TIMEOUT);
    const searchData = (await searchRes.json()) as { results?: Array<Record<string, unknown>> };
    const result = (searchData.results || [])[0];
    if (!result) return undefined;

    const tmdbId = result.id as number;

    // Fetch details + credits + videos in parallel
    const [detailRes, creditsRes, videosRes] = await Promise.all([
      fetchWithTimeout(`https://api.themoviedb.org/3/${searchMediaType}/${tmdbId}?api_key=${encodeURIComponent(apiKey)}`, TMDB_TIMEOUT),
      fetchWithTimeout(`https://api.themoviedb.org/3/${searchMediaType}/${tmdbId}/credits?api_key=${encodeURIComponent(apiKey)}`, TMDB_TIMEOUT),
      fetchWithTimeout(`https://api.themoviedb.org/3/${searchMediaType}/${tmdbId}/videos?api_key=${encodeURIComponent(apiKey)}`, TMDB_TIMEOUT),
    ]);

    const detail = (await detailRes.json()) as Record<string, unknown>;
    const credits = (await creditsRes.json()) as Record<string, unknown>;
    const videos = (await videosRes.json()) as Record<string, unknown>;

    // Extract cast
    const cast = ((credits.cast as Array<Record<string, unknown>>) || [])
      .slice(0, 10)
      .map((c) => ({
        name: c.name as string,
        character: (c.character as string) || undefined,
        profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined,
      }));

    // Extract director
    const crew = (credits.crew as Array<Record<string, unknown>>) || [];
    const director = crew.find((c) => c.job === 'Director')?.name as string | undefined;

    // Extract trailer (prefer YouTube official trailer)
    const videoResults = (videos.results as Array<Record<string, unknown>>) || [];
    const trailer = videoResults.find(
      (v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
    ) || videoResults.find((v) => v.site === 'YouTube');

    // Extract genres
    const genres = ((detail.genres as Array<Record<string, unknown>>) || []).map((g) => g.name as string);

    return {
      tmdbId,
      title: (detail.title || detail.name || result.title || result.name || title) as string,
      overview: (detail.overview as string | null) ?? null,
      posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w342${detail.poster_path}` : null,
      backdropPath: detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${detail.backdrop_path}` : null,
      releaseDate: (detail.release_date || detail.first_air_date || result.release_date || result.first_air_date || null) as string | null,
      mediaType: searchMediaType as 'movie' | 'tv',
      cast,
      trailerKey: trailer?.key as string | undefined,
      genres,
      runtime: (detail.runtime || (detail.episode_run_time as number[] | undefined)?.[0]) as number | undefined,
      voteAverage: detail.vote_average as number | undefined,
      director,
    };
  } catch (err) {
    console.error('[Cinema TMDB] Error fetching metadata:', (err as Error).message);
  }
  return undefined;
}

export default async function cinemaRoutes(fastify: FastifyInstance) {
  fastify.post('/session', { preValidation: [authenticateJWT], config: { rateLimit: false } }, async (request, reply) => {
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
      const tmdbFull = metadataQuery ? await fetchTmdbFullData(metadataQuery) : undefined;
      const metadata = tmdbFull ? { tmdbId: tmdbFull.tmdbId, title: tmdbFull.title, overview: tmdbFull.overview, posterPath: tmdbFull.posterPath, backdropPath: tmdbFull.backdropPath, releaseDate: tmdbFull.releaseDate, mediaType: tmdbFull.mediaType } : undefined;
      const sessionId = await createCinemaSession(source);
      setCinemaMetadata(sessionId, { filename: metadataQuery, s3Key, metadata });

      // Auto-save to library (always, even without TMDB)
      if (request.user) {
        try {
          const whereConditions: Array<{ s3Key: string } | { sourceUrl: string }> = [];
          if (s3Key) whereConditions.push({ s3Key });
          if (type === 'direct') whereConditions.push({ sourceUrl: uri });

          const existing = whereConditions.length > 0
            ? await prisma.movie.findFirst({
                where: { addedBy: request.user.id, OR: whereConditions }
              })
            : null;

          if (!existing) {
            const tmdbData = tmdbFull ? {
              cast: tmdbFull.cast,
              trailerKey: tmdbFull.trailerKey,
              genres: tmdbFull.genres,
              runtime: tmdbFull.runtime,
              voteAverage: tmdbFull.voteAverage,
              director: tmdbFull.director,
            } : undefined;
            await prisma.movie.create({
              data: {
                tmdbId: metadata?.tmdbId,
                title: metadata?.title || metadataQuery || 'Unknown Movie',
                overview: metadata?.overview,
                posterPath: metadata?.posterPath,
                backdropPath: metadata?.backdropPath,
                releaseDate: metadata?.releaseDate ? new Date(metadata.releaseDate) : null,
                addedBy: request.user.id,
                s3Key,
                sourceUrl: type === 'direct' ? uri : undefined,
                tmdbData: tmdbData as any,
              }
            });
          }
        } catch (err) {
          console.error('[Cinema] Failed to save movie to library:', err);
        }
      }

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

  fastify.get('/session/:id', { preValidation: [authenticateJWT], config: { rateLimit: false } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const session = await getSession(id);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      return reply.send({
        id: session.id,
        status: session.status,
        source: session.source,
        createdAt: session.createdAt,
        error: session.error || undefined,
        progress: session.progress
      });
    } catch (err: any) {
      const status = err.statusCode || 500;
      return reply.status(status).send({ error: err.message || 'Failed to get session' });
    }
  });

  fastify.get('/stream/:id/playlist.m3u8', { preValidation: [authenticateJWT], config: { rateLimit: false } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const playlist = await getPlaylist(id);
    if (!playlist) return reply.status(404).send({ error: 'Playlist not found' });
    return reply.header('Content-Type', 'application/vnd.apple.mpegurl').send(playlist.data);
  });

  fastify.get('/stream/:id/:filename', { preValidation: [authenticateJWT], config: { rateLimit: false } }, async (request, reply) => {
    const { id, filename } = request.params as { id: string; filename: string };
    if (!/\.(ts|m4s|mp4|m3u8)$/i.test(filename)) {
      return reply.status(400).send({ error: 'Invalid file type' });
    }
    const segment = await getSegment(id, filename);
    if (!segment) return reply.status(404).send({ error: 'Segment not found' });
    const ext = filename.split('.').pop()?.toLowerCase();
    const mime = ext === 'm3u8'
      ? 'application/vnd.apple.mpegurl'
      : ext === 'ts'
        ? 'video/mp2t'
        : 'video/iso.segment';
    return reply.header('Content-Type', mime).send(segment.data);
  });

  fastify.get('/session/:id/download', { preValidation: [authenticateJWT], config: { rateLimit: false } }, async (request, reply) => {
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

  fastify.delete('/session/:id', { preValidation: [authenticateJWT], config: { rateLimit: false } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await destroySession(id);
    clearCinemaMetadata(id);
    return reply.send({ ok: true });
  });
}
