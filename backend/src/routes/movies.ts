import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

router.get('/', authenticateJWT, async (_req, res) => {
  try {
    const movies = await prisma.movie.findMany({
      orderBy: [{ watched: 'asc' }, { createdAt: 'desc' }]
    });
    res.json(movies);
  } catch (error) {
    console.error('[Movie Error]', error);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

router.get('/search', authenticateJWT, async (req, res) => {
  try {
    const query = req.query.t as string;
    if (!query || query.length < 2) {
      res.status(400).json({ error: 'Query too short' });
      return;
    }

    if (!TMDB_API_KEY) {
      // Fallback: search local DB
      const local = await prisma.movie.findMany({
        where: { title: { contains: query, mode: 'insensitive' } }
      });
      res.json(local.map(m => ({
        tmdbId: m.tmdbId,
        title: m.title,
        posterPath: m.posterPath,
        releaseDate: m.releaseDate?.toISOString().split('T')[0]
      })));
      return;
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`
    );
    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    const results = (data.results || []).slice(0, 8).map((m) => ({
      tmdbId: m.id as number,
      title: m.title as string,
      posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
      releaseDate: m.release_date as string | undefined
    }));

    res.json(results);
  } catch (error) {
    console.error('[Movie Search Error]', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({ tmdbId: z.number().int().positive() });
    const { tmdbId } = schema.parse(req.body);

    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username: req.user!.username, displayName: req.user!.displayName }
      });
    }

    // Check if exists
    const existing = await prisma.movie.findUnique({ where: { tmdbId } });
    if (existing) {
      res.status(409).json({ error: 'Movie already in watchlist' });
      return;
    }

    // Fetch from TMDB if key available
    let title = `Movie #${tmdbId}`;
    let overview: string | null = null;
    let posterPath: string | null = null;
    let backdropPath: string | null = null;
    let releaseDate: Date | null = null;

    if (TMDB_API_KEY) {
      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`
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

    const movie = await prisma.movie.create({
      data: {
        tmdbId,
        title,
        overview,
        posterPath,
        backdropPath,
        releaseDate,
        addedBy: user.id
      }
    });

    res.status(201).json(movie);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('[Movie Error]', error);
    res.status(500).json({ error: 'Failed to add movie' });
  }
});

router.patch('/:id/watched', authenticateJWT, async (req, res) => {
  try {
    const movie = await prisma.movie.update({
      where: { id: req.params.id },
      data: {
        watched: true,
        watchedAt: new Date()
      }
    });
    res.json(movie);
  } catch {
    res.status(404).json({ error: 'Movie not found' });
  }
});

router.patch('/:id/rate', authenticateJWT, async (req, res) => {
  try {
    const schema = z.object({ rating: z.number().int().min(1).max(10) });
    const { rating } = schema.parse(req.body);
    const movie = await prisma.movie.update({
      where: { id: req.params.id },
      data: { rating }
    });
    res.json(movie);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    res.status(404).json({ error: 'Movie not found' });
  }
});

router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    await prisma.movie.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Movie not found' });
  }
});

export default router;
