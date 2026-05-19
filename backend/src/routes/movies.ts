import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
import { broadcastToPartner } from '../services/broadcast.js';

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
}
