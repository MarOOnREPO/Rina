import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';
import { prisma } from '../services/prisma.js';
import { spotifyApiRequest } from '../services/spotify.js';

export default async function spotifyRoutes(fastify: FastifyInstance) {
  // Store tokens sent from frontend after PKCE popup flow
  fastify.post('/connect', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const bodySchema = z.object({
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1),
      expiresIn: z.number().int().positive()
    });
    const parse = bodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: parse.error.flatten() });
    }

    const { accessToken, refreshToken, expiresIn } = parse.data;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.spotifyToken.upsert({
      where: { userId: request.user!.id },
      update: { accessToken, refreshToken, expiresAt },
      create: { userId: request.user!.id, accessToken, refreshToken, expiresAt }
    });

    return reply.send({ connected: true });
  });

  // Disconnect
  fastify.delete('/connect', { preValidation: [authenticateJWT] }, async (request, reply) => {
    await prisma.spotifyToken.deleteMany({ where: { userId: request.user!.id } });
    return reply.send({ connected: false });
  });

  fastify.get('/me', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const res = await spotifyApiRequest('/me/player', { method: 'GET' }, request.user!.id);
    return reply.status(res.status).send(res);
  });

  fastify.get('/devices', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const res = await spotifyApiRequest('/me/player/devices', { method: 'GET' }, request.user!.id);
    return reply.status(res.status).send(res);
  });

  fastify.get('/search', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { q, type = 'track', limit = '10' } = request.query as Record<string, string>;
    if (!q) return reply.status(400).send({ error: 'Missing query param q' });
    const endpoint = `/search?q=${encodeURIComponent(q)}&type=${type}&limit=${limit}`;
    const res = await spotifyApiRequest(endpoint, { method: 'GET' }, request.user!.id);
    return reply.status(res.status).send(res);
  });

  fastify.put('/play', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const bodySchema = z.object({
      uris: z.array(z.string()).optional(),
      context_uri: z.string().optional(),
      position_ms: z.number().default(0),
      device_id: z.string().optional()
    });
    const parse = bodySchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });

    const { device_id, ...payload } = parse.data;
    const endpoint = device_id ? `/me/player/play?device_id=${device_id}` : '/me/player/play';
    const res = await spotifyApiRequest(endpoint, { method: 'PUT', body: JSON.stringify(payload) }, request.user!.id);
    return reply.status(res.status).send(res);
  });

  fastify.put('/pause', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { device_id } = request.query as { device_id?: string };
    const endpoint = device_id ? `/me/player/pause?device_id=${device_id}` : '/me/player/pause';
    const res = await spotifyApiRequest(endpoint, { method: 'PUT' }, request.user!.id);
    return reply.status(res.status).send(res);
  });

  fastify.put('/seek', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const bodySchema = z.object({
      position_ms: z.number(),
      device_id: z.string().optional()
    });
    const parse = bodySchema.safeParse(request.body);
    if (!parse.success) return reply.status(400).send({ error: parse.error.flatten() });

    const { position_ms, device_id } = parse.data;
    const query = new URLSearchParams({ position_ms: String(position_ms) });
    if (device_id) query.set('device_id', device_id);
    const res = await spotifyApiRequest(`/me/player/seek?${query.toString()}`, { method: 'PUT' }, request.user!.id);
    return reply.status(res.status).send(res);
  });
}
