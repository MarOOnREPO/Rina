import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
import { broadcastToPartner } from '../services/broadcast.js';
import { listObjects } from '../services/s3.js';
import { cleanTitleFromFilename } from '../utils/cleanTitle.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
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

function getTmdbImageUrl(path: string | null, size: string): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

let cachedGenres: Array<{ id: number; name: string }> | null = null;
let cachedGenresAt = 0;
const GENRE_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export default async function movieRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/', { preValidation: [authenticateJWT] }, async (_request, reply) => {
    try {
      const movies = await prisma.movie.findMany({
        orderBy: [{ watched: 'asc' }, { createdAt: 'desc' }]
      });
      return reply.send(movies);
    } catch (error) {
      console.error('[Movie Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch movies' });
    }
  });

  fastify.get('/search', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const querySchema = z.object({ t: z.string().min(2).max(100) });
      const { t } = querySchema.parse(request.query);

      if (!TMDB_API_KEY) {
        const local = await prisma.movie.findMany({
          where: { title: { contains: t, mode: 'insensitive' } }
        });
        return reply.send(local.map(m => ({
          tmdbId: m.tmdbId,
          title: m.title,
          posterPath: m.posterPath,
          releaseDate: m.releaseDate?.toISOString().split('T')[0]
        })));
      }

      const response = await fetchWithTimeout(
        `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(TMDB_API_KEY)}&query=${encodeURIComponent(t)}&page=1`,
        TMDB_TIMEOUT
      );
      const data = await response.json() as { results?: Array<Record<string, unknown>> };
      const results = (data.results || []).slice(0, 8).map((m) => ({
        tmdbId: m.id as number,
        title: m.title as string,
        posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
        releaseDate: m.release_date as string | undefined
      }));

      return reply.send(results);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie Search Error]', error);
      return reply.status(500).send({ error: 'Search failed' });
    }
  });

  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const schema = z.object({ tmdbId: z.number().int().positive() });
      const { tmdbId } = schema.parse(request.body);

      let title = `Movie #${tmdbId}`;
      let overview: string | null = null;
      let posterPath: string | null = null;
      let backdropPath: string | null = null;
      let releaseDate: Date | null = null;

      if (TMDB_API_KEY) {
        try {
          const response = await fetchWithTimeout(
            `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(TMDB_API_KEY)}`,
            TMDB_TIMEOUT
          );
          const data = await response.json() as Record<string, unknown>;
          title = (data.title as string) || title;
          overview = (data.overview as string | null) ?? null;
          posterPath = data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null;
          backdropPath = data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : null;
          releaseDate = data.release_date ? new Date(data.release_date as string) : null;
        } catch {
          // ignore TMDB fetch errors
        }
      }

      try {
        const movie = await prisma.movie.create({
          data: {
            tmdbId,
            title,
            overview,
            posterPath,
            backdropPath,
            releaseDate,
            addedBy: request.user!.id
          }
        });
        await broadcastToPartner(request.user!.id, { type: 'movie', action: 'created', data: movie });
        return reply.status(201).send(movie);
      } catch (createError: unknown) {
        const err = createError as { code?: string };
        if (err.code === 'P2002') {
          return reply.status(409).send({ error: 'Movie already in watchlist' });
        }
        throw createError;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie Error]', error);
      return reply.status(500).send({ error: 'Failed to add movie' });
    }
  });

  // ─── Discover movies from TMDB ─────────────────────────────────
  fastify.get('/discover/:category', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ category: z.enum(['popular', 'top_rated', 'upcoming', 'now_playing']) });
      const querySchema = z.object({ page: z.string().regex(/^\d+$/).default('1') });
      const { category } = paramsSchema.parse(request.params);
      const { page } = querySchema.parse(request.query);

      if (!TMDB_API_KEY) {
        return reply.send({ results: [], page: 1, total_pages: 0 });
      }

      const response = await fetchWithTimeout(
        `https://api.themoviedb.org/3/movie/${category}?api_key=${encodeURIComponent(TMDB_API_KEY)}&page=${page}`,
        TMDB_TIMEOUT
      );
      const data = await response.json() as {
        results?: Array<Record<string, unknown>>;
        page?: number;
        total_pages?: number;
      };

      const results = (data.results || []).map((m) => ({
        tmdbId: m.id as number,
        title: m.title as string,
        posterPath: getTmdbImageUrl(m.poster_path as string | null, 'w342'),
        backdropPath: getTmdbImageUrl(m.backdrop_path as string | null, 'w780'),
        releaseDate: m.release_date as string | undefined,
        voteAverage: m.vote_average as number | undefined,
        overview: m.overview as string | undefined
      }));

      return reply.send({
        results,
        page: data.page ?? 1,
        total_pages: data.total_pages ?? 1
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie Discover Error]', error);
      return reply.send({ results: [], page: 1, total_pages: 1 });
    }
  });

  // ─── List TMDB genres (cached) ───────────────────────────────────
  fastify.get('/genres', { preValidation: [authenticateJWT] }, async (_request, reply) => {
    try {
      if (cachedGenres && Date.now() - cachedGenresAt < GENRE_CACHE_TTL) {
        return reply.send({ genres: cachedGenres });
      }

      if (!TMDB_API_KEY) {
        return reply.send({ genres: [] });
      }

      const response = await fetchWithTimeout(
        `https://api.themoviedb.org/3/genre/movie/list?api_key=${encodeURIComponent(TMDB_API_KEY)}`,
        TMDB_TIMEOUT
      );
      const data = await response.json() as { genres?: Array<{ id: number; name: string }> };
      cachedGenres = data.genres || [];
      cachedGenresAt = Date.now();
      return reply.send({ genres: cachedGenres });
    } catch (error) {
      console.error('[Movie Genres Error]', error);
      if (cachedGenres) {
        return reply.send({ genres: cachedGenres });
      }
      return reply.send({ genres: [] });
    }
  });

  // ─── Movies by genre ─────────────────────────────────────────────
  fastify.get('/genre/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().regex(/^\d+$/) });
      const querySchema = z.object({ page: z.string().regex(/^\d+$/).default('1') });
      const { id } = paramsSchema.parse(request.params);
      const { page } = querySchema.parse(request.query);

      if (!TMDB_API_KEY) {
        return reply.send({ results: [], page: 1, total_pages: 0 });
      }

      const response = await fetchWithTimeout(
        `https://api.themoviedb.org/3/discover/movie?api_key=${encodeURIComponent(TMDB_API_KEY)}&with_genres=${id}&page=${page}`,
        TMDB_TIMEOUT
      );
      const data = await response.json() as {
        results?: Array<Record<string, unknown>>;
        page?: number;
        total_pages?: number;
      };

      const results = (data.results || []).map((m) => ({
        tmdbId: m.id as number,
        title: m.title as string,
        posterPath: getTmdbImageUrl(m.poster_path as string | null, 'w342'),
        backdropPath: getTmdbImageUrl(m.backdrop_path as string | null, 'w780'),
        releaseDate: m.release_date as string | undefined,
        voteAverage: m.vote_average as number | undefined,
        overview: m.overview as string | undefined
      }));

      return reply.send({
        results,
        page: data.page ?? 1,
        total_pages: data.total_pages ?? 1
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie Genre Error]', error);
      return reply.send({ results: [], page: 1, total_pages: 1 });
    }
  });

  // ─── Full TMDB details for a movie ───────────────────────────────
  fastify.get('/:id/tmdb', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().regex(/^\d+$/) });
      const { id } = paramsSchema.parse(request.params);
      const tmdbId = parseInt(id, 10);

      if (!TMDB_API_KEY) {
        return reply.status(503).send({ error: 'TMDB API key not configured' });
      }

      const [detailRes, creditsRes, videosRes, recRes] = await Promise.all([
        fetchWithTimeout(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
        fetchWithTimeout(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
        fetchWithTimeout(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
        fetchWithTimeout(`https://api.themoviedb.org/3/movie/${tmdbId}/recommendations?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
      ]);

      const detail = await detailRes.json() as Record<string, unknown>;
      const credits = await creditsRes.json() as Record<string, unknown>;
      const videos = await videosRes.json() as Record<string, unknown>;
      const recommendationsData = await recRes.json() as { results?: Array<Record<string, unknown>> };

      const cast = ((credits.cast as Array<Record<string, unknown>>) || []).slice(0, 10).map((c) => ({
        name: c.name as string,
        character: (c.character as string) || undefined,
        profilePath: getTmdbImageUrl(c.profile_path as string | null, 'w185'),
      }));

      const crew = (credits.crew as Array<Record<string, unknown>>) || [];
      const director = crew.find((c) => c.job === 'Director')?.name as string | undefined;

      const videoResults = (videos.results as Array<Record<string, unknown>>) || [];
      const trailer = videoResults.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
        || videoResults.find((v) => v.site === 'YouTube');

      const genres = ((detail.genres as Array<Record<string, unknown>>) || []).map((g) => ({
        id: g.id as number,
        name: g.name as string
      }));

      const recommendations = ((recommendationsData.results as Array<Record<string, unknown>>) || []).slice(0, 10).map((m) => ({
        tmdbId: m.id as number,
        title: m.title as string,
        posterPath: getTmdbImageUrl(m.poster_path as string | null, 'w342'),
        backdropPath: getTmdbImageUrl(m.backdrop_path as string | null, 'w780'),
        releaseDate: m.release_date as string | undefined,
        voteAverage: m.vote_average as number | undefined,
        overview: m.overview as string | undefined
      }));

      return reply.send({
        tmdbId,
        title: (detail.title as string) || '',
        overview: (detail.overview as string) || '',
        posterPath: getTmdbImageUrl(detail.poster_path as string | null, 'w342'),
        backdropPath: getTmdbImageUrl(detail.backdrop_path as string | null, 'w780'),
        releaseDate: detail.release_date as string | undefined,
        runtime: detail.runtime as number | undefined,
        voteAverage: detail.vote_average as number | undefined,
        genres,
        cast,
        trailerKey: trailer?.key as string | undefined,
        director,
        recommendations
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie TMDB Detail Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch TMDB details' });
    }
  });

  // ─── Add a TMDB movie to library with full data ──────────────────
  fastify.post('/from-tmdb', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const schema = z.object({ tmdbId: z.number().int().positive() });
      const { tmdbId } = schema.parse(request.body);

      const existing = await prisma.movie.findFirst({
        where: { tmdbId, addedBy: request.user!.id }
      });
      if (existing) {
        return reply.status(409).send({ error: 'Movie already in watchlist' });
      }

      let title = `Movie #${tmdbId}`;
      let overview: string | null = null;
      let posterPath: string | null = null;
      let backdropPath: string | null = null;
      let releaseDate: Date | null = null;
      let tmdbData: Record<string, unknown> | undefined = undefined;

      if (TMDB_API_KEY) {
        try {
          const [detailRes, creditsRes, videosRes] = await Promise.all([
            fetchWithTimeout(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
            fetchWithTimeout(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
            fetchWithTimeout(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
          ]);

          const detail = await detailRes.json() as Record<string, unknown>;
          const credits = await creditsRes.json() as Record<string, unknown>;
          const videos = await videosRes.json() as Record<string, unknown>;

          title = (detail.title as string) || title;
          overview = (detail.overview as string | null) ?? null;
          posterPath = getTmdbImageUrl(detail.poster_path as string | null, 'w342');
          backdropPath = getTmdbImageUrl(detail.backdrop_path as string | null, 'w780');
          releaseDate = detail.release_date ? new Date(detail.release_date as string) : null;

          const cast = ((credits.cast as Array<Record<string, unknown>>) || []).slice(0, 10).map((c) => ({
            name: c.name as string,
            character: (c.character as string) || undefined,
            profilePath: getTmdbImageUrl(c.profile_path as string | null, 'w185'),
          }));

          const crew = (credits.crew as Array<Record<string, unknown>>) || [];
          const director = crew.find((c) => c.job === 'Director')?.name as string | undefined;

          const videoResults = (videos.results as Array<Record<string, unknown>>) || [];
          const trailer = videoResults.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
            || videoResults.find((v) => v.site === 'YouTube');

          const genres = ((detail.genres as Array<Record<string, unknown>>) || []).map((g) => g.name as string);

          tmdbData = {
            cast,
            trailerKey: trailer?.key as string | undefined,
            genres,
            runtime: detail.runtime as number | undefined,
            voteAverage: detail.vote_average as number | undefined,
            director,
          };
        } catch {
          // ignore TMDB fetch errors, create with minimal data
        }
      }

      const movie = await prisma.movie.create({
        data: {
          tmdbId,
          title,
          overview,
          posterPath,
          backdropPath,
          releaseDate,
          addedBy: request.user!.id,
          tmdbData: tmdbData as any,
        }
      });
      await broadcastToPartner(request.user!.id, { type: 'movie', action: 'created', data: movie });
      return reply.status(201).send(movie);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      const err = error as { code?: string };
      if (err.code === 'P2002') {
        return reply.status(409).send({ error: 'Movie already in watchlist' });
      }
      console.error('[Movie From TMDB Error]', error);
      return reply.status(500).send({ error: 'Failed to add movie from TMDB' });
    }
  });

  fastify.patch('/:id/watched', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.movie.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Movie not found' });
      }
      if (existing.addedBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized' });
      }

      const movie = await prisma.movie.update({
        where: { id: params.id },
        data: { watched: true, watchedAt: new Date() }
      });
      await broadcastToPartner(request.user!.id, { type: 'movie', action: 'updated', data: movie });
      return reply.send(movie);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie Error]', error);
      return reply.status(500).send({ error: 'Failed to update movie' });
    }
  });

  fastify.patch('/:id/rate', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const schema = z.object({ rating: z.number().int().min(1).max(10) });
      const { rating } = schema.parse(request.body);
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.movie.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Movie not found' });
      }
      if (existing.addedBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized' });
      }

      const movie = await prisma.movie.update({
        where: { id: params.id },
        data: { rating }
      });
      await broadcastToPartner(request.user!.id, { type: 'movie', action: 'updated', data: movie });
      return reply.send(movie);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie Error]', error);
      return reply.status(500).send({ error: 'Failed to rate movie' });
    }
  });

  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.movie.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Movie not found' });
      }
      if (existing.addedBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized' });
      }

      await prisma.movie.delete({ where: { id: params.id } });
      await broadcastToPartner(request.user!.id, { type: 'movie', action: 'deleted', data: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Movie Error]', error);
      return reply.status(500).send({ error: 'Failed to delete movie' });
    }
  });

  // ─── Clear all movies for current user ──────────────────────────
  fastify.delete('/all', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const { count } = await prisma.movie.deleteMany({
        where: { addedBy: request.user!.id }
      });
      await broadcastToPartner(request.user!.id, { type: 'movie', action: 'cleared', data: { count } });
      return reply.send({ deleted: count });
    } catch (error) {
      console.error('[Movie Clear All Error]', error);
      return reply.status(500).send({ error: 'Failed to clear movies' });
    }
  });

  // ─── Import from S3 ──────────────────────────────────────────────
  fastify.post('/import-s3', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const objects = await listObjects();
      const videoObjects = objects.filter((obj) =>
        /\.(mp4|mkv|avi|mov|webm|mpeg|mpg)$/i.test(obj.key)
      );

      let imported = 0;
      let skipped = 0;

      for (const obj of videoObjects) {
        // Skip if already in library
        const existing = await prisma.movie.findFirst({
          where: { s3Key: obj.key, addedBy: request.user!.id }
        });
        if (existing) {
          skipped++;
          continue;
        }

        const filename = obj.key.split('/').pop() || obj.key;
        const cleanTitle = cleanTitleFromFilename(filename);
        const fullData = cleanTitle.title
          ? await fetchTmdbFullData(cleanTitle.title, cleanTitle.year, cleanTitle.isTv)
          : undefined;

        await prisma.movie.create({
          data: {
            tmdbId: fullData?.tmdbId,
            title: fullData?.title || cleanTitle.title || filename,
            overview: fullData?.overview,
            posterPath: fullData?.posterPath,
            backdropPath: fullData?.backdropPath,
            releaseDate: fullData?.releaseDate ? new Date(fullData.releaseDate) : null,
            addedBy: request.user!.id,
            s3Key: obj.key,
            tmdbData: fullData?.tmdbData as any,
          }
        });
        imported++;
      }

      return reply.send({ imported, skipped, total: videoObjects.length });
    } catch (error) {
      console.error('[Movie Import Error]', error);
      return reply.status(500).send({ error: 'Failed to import from S3' });
    }
  });
}

async function fetchTmdbFullData(title: string, year?: string, isTv?: boolean): Promise<{
  tmdbId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  tmdbData: {
    cast?: Array<{ name: string; character?: string; profilePath?: string }>;
    trailerKey?: string;
    genres?: string[];
    runtime?: number;
    voteAverage?: number;
    director?: string;
  };
} | undefined> {
  if (!TMDB_API_KEY) return undefined;
  try {
    const mediaType = isTv ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${encodeURIComponent(TMDB_API_KEY)}&query=${encodeURIComponent(title)}${year ? (mediaType === 'tv' ? `&first_air_date_year=${year}` : `&year=${year}`) : ''}&page=1`;
    const res = await fetchWithTimeout(url, TMDB_TIMEOUT);
    const data = await res.json() as { results?: Array<Record<string, unknown>> };
    const result = (data.results || [])[0];
    if (!result) return undefined;

    const tmdbId = result.id as number;

    const [detailRes, creditsRes, videosRes] = await Promise.all([
      fetchWithTimeout(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
      fetchWithTimeout(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/credits?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
      fetchWithTimeout(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${encodeURIComponent(TMDB_API_KEY)}`, TMDB_TIMEOUT),
    ]);

    const detail = await detailRes.json() as Record<string, unknown>;
    const credits = await creditsRes.json() as Record<string, unknown>;
    const videos = await videosRes.json() as Record<string, unknown>;

    const cast = ((credits.cast as Array<Record<string, unknown>>) || []).slice(0, 10).map((c) => ({
      name: c.name as string,
      character: (c.character as string) || undefined,
      profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined,
    }));

    const crew = (credits.crew as Array<Record<string, unknown>>) || [];
    const director = crew.find((c) => c.job === 'Director')?.name as string | undefined;

    const videoResults = (videos.results as Array<Record<string, unknown>>) || [];
    const trailer = videoResults.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
      || videoResults.find((v) => v.site === 'YouTube');

    const genres = ((detail.genres as Array<Record<string, unknown>>) || []).map((g) => g.name as string);

    return {
      tmdbId,
      title: (detail.title || detail.name || result.title || result.name || title) as string,
      overview: (detail.overview as string | null) ?? null,
      posterPath: detail.poster_path ? `https://image.tmdb.org/t/p/w342${detail.poster_path}` : null,
      backdropPath: detail.backdrop_path ? `https://image.tmdb.org/t/p/w780${detail.backdrop_path}` : null,
      releaseDate: (detail.release_date || detail.first_air_date || result.release_date || result.first_air_date || null) as string | null,
      tmdbData: {
        cast,
        trailerKey: trailer?.key as string | undefined,
        genres,
        runtime: (detail.runtime || (detail.episode_run_time as number[] | undefined)?.[0]) as number | undefined,
        voteAverage: detail.vote_average as number | undefined,
        director,
      }
    };
  } catch {
    return undefined;
  }
}
