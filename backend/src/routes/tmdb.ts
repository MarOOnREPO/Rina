import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';

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

export default async function tmdbRoutes(fastify: FastifyInstance) {
  // ─── Search movies ───────────────────────────────────────────────
  fastify.get('/search', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const querySchema = z.object({ q: z.string().min(1).max(100), page: z.string().regex(/^\d+$/).default('1') });
      const { q, page } = querySchema.parse(request.query);

      if (!TMDB_API_KEY) {
        return reply.send({ results: [], page: 1, total_pages: 0 });
      }

      const response = await fetchWithTimeout(
        `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(TMDB_API_KEY)}&query=${encodeURIComponent(q)}&page=${page}`,
        TMDB_TIMEOUT
      );
      const data = await response.json() as {
        results?: Array<Record<string, unknown>>;
        page?: number;
        total_pages?: number;
      };

      const results = (data.results || []).slice(0, 20).map((m) => ({
        id: m.id as number,
        tmdbId: m.id as number,
        title: m.title as string,
        poster_path: m.poster_path as string | null,
        posterPath: getTmdbImageUrl(m.poster_path as string | null, 'w342'),
        backdrop_path: m.backdrop_path as string | null,
        backdropPath: getTmdbImageUrl(m.backdrop_path as string | null, 'w780'),
        release_date: m.release_date as string | undefined,
        releaseDate: m.release_date as string | undefined,
        vote_average: m.vote_average as number | undefined,
        voteAverage: m.vote_average as number | undefined,
        overview: m.overview as string | undefined,
      }));

      return reply.send({
        results,
        page: data.page ?? 1,
        total_pages: data.total_pages ?? 1,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[TMDB Search Error]', error);
      return reply.status(500).send({ error: 'Search failed' });
    }
  });

  // ─── Discover movies ─────────────────────────────────────────────
  fastify.get('/discover', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const querySchema = z.object({
        category: z.enum(['popular', 'top_rated', 'upcoming', 'now_playing']).default('popular'),
        page: z.string().regex(/^\d+$/).default('1'),
      });
      const { category, page } = querySchema.parse(request.query);

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
        id: m.id as number,
        tmdbId: m.id as number,
        title: m.title as string,
        poster_path: m.poster_path as string | null,
        posterPath: getTmdbImageUrl(m.poster_path as string | null, 'w342'),
        backdrop_path: m.backdrop_path as string | null,
        backdropPath: getTmdbImageUrl(m.backdrop_path as string | null, 'w780'),
        release_date: m.release_date as string | undefined,
        releaseDate: m.release_date as string | undefined,
        vote_average: m.vote_average as number | undefined,
        voteAverage: m.vote_average as number | undefined,
        overview: m.overview as string | undefined,
      }));

      return reply.send({
        results,
        page: data.page ?? 1,
        total_pages: data.total_pages ?? 1,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[TMDB Discover Error]', error);
      return reply.send({ results: [], page: 1, total_pages: 1 });
    }
  });

  // ─── Get movie details ───────────────────────────────────────────
  fastify.get('/movie/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().regex(/^\d+$/) });
      const { id } = paramsSchema.parse(request.params);

      if (!TMDB_API_KEY) {
        return reply.status(503).send({ error: 'TMDB API key not configured' });
      }

      const response = await fetchWithTimeout(
        `https://api.themoviedb.org/3/movie/${id}?api_key=${encodeURIComponent(TMDB_API_KEY)}`,
        TMDB_TIMEOUT
      );
      const detail = await response.json() as Record<string, unknown>;

      if ((detail as any).status_code) {
        return reply.status(404).send({ error: 'Movie not found' });
      }

      return reply.send({
        id: detail.id as number,
        tmdbId: detail.id as number,
        title: (detail.title as string) || '',
        overview: (detail.overview as string) || '',
        poster_path: detail.poster_path as string | null,
        posterPath: getTmdbImageUrl(detail.poster_path as string | null, 'w342'),
        backdrop_path: detail.backdrop_path as string | null,
        backdropPath: getTmdbImageUrl(detail.backdrop_path as string | null, 'w780'),
        release_date: detail.release_date as string | undefined,
        releaseDate: detail.release_date as string | undefined,
        runtime: detail.runtime as number | undefined,
        vote_average: detail.vote_average as number | undefined,
        voteAverage: detail.vote_average as number | undefined,
        genres: ((detail.genres as Array<Record<string, unknown>>) || []).map((g) => ({
          id: g.id as number,
          name: g.name as string,
        })),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[TMDB Movie Detail Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch movie details' });
    }
  });

  // ─── Get movie credits ───────────────────────────────────────────
  fastify.get('/movie/:id/credits', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().regex(/^\d+$/) });
      const { id } = paramsSchema.parse(request.params);

      if (!TMDB_API_KEY) {
        return reply.status(503).send({ error: 'TMDB API key not configured' });
      }

      const response = await fetchWithTimeout(
        `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${encodeURIComponent(TMDB_API_KEY)}`,
        TMDB_TIMEOUT
      );
      const credits = await response.json() as Record<string, unknown>;

      const cast = ((credits.cast as Array<Record<string, unknown>>) || []).slice(0, 10).map((c) => ({
        id: c.id as number,
        name: c.name as string,
        character: (c.character as string) || '',
        profile_path: c.profile_path as string | null,
        profilePath: getTmdbImageUrl(c.profile_path as string | null, 'w185'),
        order: c.order as number,
      }));

      const crew = ((credits.crew as Array<Record<string, unknown>>) || []).map((c) => ({
        id: c.id as number,
        name: c.name as string,
        job: c.job as string,
        profile_path: c.profile_path as string | null,
        profilePath: getTmdbImageUrl(c.profile_path as string | null, 'w185'),
      }));

      return reply.send({ cast, crew });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[TMDB Credits Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch credits' });
    }
  });

  // ─── List genres (cached) ────────────────────────────────────────
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
      console.error('[TMDB Genres Error]', error);
      if (cachedGenres) {
        return reply.send({ genres: cachedGenres });
      }
      return reply.send({ genres: [] });
    }
  });
}
