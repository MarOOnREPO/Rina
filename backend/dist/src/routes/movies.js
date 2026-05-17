import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
export default async function movieRoutes(fastify, _opts) {
    fastify.get('/', { preValidation: [authenticateJWT] }, async (_request, reply) => {
        try {
            const movies = await prisma.movie.findMany({
                orderBy: [{ watched: 'asc' }, { createdAt: 'desc' }]
            });
            return reply.send(movies);
        }
        catch (error) {
            console.error('[Movie Error]', error);
            return reply.status(500).send({ error: 'Failed to fetch movies' });
        }
    });
    fastify.get('/search', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const query = request.query.t;
            if (!query || query.length < 2) {
                return reply.status(400).send({ error: 'Query too short' });
            }
            if (!TMDB_API_KEY) {
                const local = await prisma.movie.findMany({
                    where: { title: { contains: query, mode: 'insensitive' } }
                });
                return reply.send(local.map(m => ({
                    tmdbId: m.tmdbId,
                    title: m.title,
                    posterPath: m.posterPath,
                    releaseDate: m.releaseDate?.toISOString().split('T')[0]
                })));
            }
            const response = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1`);
            const data = await response.json();
            const results = (data.results || []).slice(0, 8).map((m) => ({
                tmdbId: m.id,
                title: m.title,
                posterPath: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
                releaseDate: m.release_date
            }));
            return reply.send(results);
        }
        catch (error) {
            console.error('[Movie Search Error]', error);
            return reply.status(500).send({ error: 'Search failed' });
        }
    });
    fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const schema = z.object({ tmdbId: z.number().int().positive() });
            const { tmdbId } = schema.parse(request.body);
            let user = await prisma.user.findUnique({ where: { username: request.user.username } });
            if (!user) {
                user = await prisma.user.create({
                    data: { username: request.user.username, displayName: request.user.displayName }
                });
            }
            const existing = await prisma.movie.findUnique({ where: { tmdbId } });
            if (existing) {
                return reply.status(409).send({ error: 'Movie already in watchlist' });
            }
            let title = `Movie #${tmdbId}`;
            let overview = null;
            let posterPath = null;
            let backdropPath = null;
            let releaseDate = null;
            if (TMDB_API_KEY) {
                try {
                    const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
                    const data = await response.json();
                    title = data.title || title;
                    overview = data.overview ?? null;
                    posterPath = data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null;
                    backdropPath = data.backdrop_path ? `https://image.tmdb.org/t/p/w780${data.backdrop_path}` : null;
                    releaseDate = data.release_date ? new Date(data.release_date) : null;
                }
                catch {
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
            return reply.status(201).send(movie);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            console.error('[Movie Error]', error);
            return reply.status(500).send({ error: 'Failed to add movie' });
        }
    });
    fastify.patch('/:id/watched', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            const movie = await prisma.movie.update({
                where: { id: params.id },
                data: { watched: true, watchedAt: new Date() }
            });
            return reply.send(movie);
        }
        catch {
            return reply.status(404).send({ error: 'Movie not found' });
        }
    });
    fastify.patch('/:id/rate', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const schema = z.object({ rating: z.number().int().min(1).max(10) });
            const { rating } = schema.parse(request.body);
            const params = request.params;
            const movie = await prisma.movie.update({
                where: { id: params.id },
                data: { rating }
            });
            return reply.send(movie);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            return reply.status(404).send({ error: 'Movie not found' });
        }
    });
    fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            await prisma.movie.delete({ where: { id: params.id } });
            return reply.status(204).send();
        }
        catch {
            return reply.status(404).send({ error: 'Movie not found' });
        }
    });
}
//# sourceMappingURL=movies.js.map