import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';
import {
  createCinemaSession,
  getSession,
  getPlaylist,
  getSegment,
  destroySession
} from '../services/cinema.js';

const startBodySchema = z.object({
  type: z.enum(['torrent', 'direct']),
  uri: z.string().min(1)
});

export default async function cinemaRoutes(fastify: FastifyInstance) {
  fastify.post('/session', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const parse = startBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parse.error.flatten() });
    }

    try {
      const sessionId = await createCinemaSession(parse.data);
      const session = getSession(sessionId)!;
      return reply.status(201).send({
        id: sessionId,
        status: session.status,
        playlistUrl: `/api/cinema/stream/${sessionId}/playlist.m3u8`,
        error: session.error || undefined
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to start session', message: err.message });
    }
  });

  fastify.get('/session/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id);
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

  fastify.delete('/session/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await destroySession(id);
    return reply.send({ ok: true });
  });
}
