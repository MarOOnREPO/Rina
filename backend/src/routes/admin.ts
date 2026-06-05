import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';
import {
  getAllConfig,
  setConfig,
  deleteConfig,
  CONFIG_KEYS,
  type ConfigKey,
  buildPublicConfig,
} from '../services/config.js';

export default async function adminRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
) {
  // GET /api/admin/config — returns all config values
  fastify.get('/config', { preValidation: [authenticateJWT] }, async (_request, reply) => {
    const config = await getAllConfig();
    return reply.send({ config });
  });

  // GET /api/admin/config/public — same as /api/config but admin can see it too
  fastify.get('/config/public', async (_request, reply) => {
    const publicConfig = await buildPublicConfig();
    return reply.send(publicConfig);
  });

  // PUT /api/admin/config — update multiple keys
  fastify.put('/config', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({ error: 'Invalid body' });
    }

    const updates = body.config as Record<string, string> | undefined;
    if (!updates || typeof updates !== 'object') {
      return reply.status(400).send({ error: 'Missing config object' });
    }

    const user = request.user!;
    const updatedBy = user.username;
    const results: Record<string, boolean> = {};

    for (const [key, value] of Object.entries(updates)) {
      if (!CONFIG_KEYS.includes(key as ConfigKey)) {
        results[key] = false;
        continue;
      }
      await setConfig(key as ConfigKey, String(value ?? ''), updatedBy);
      results[key] = true;
    }

    return reply.send({ success: true, results });
  });

  // PUT /api/admin/config/:key — update single key
  fastify.put('/config/:key', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = request.body as { value?: string };

    if (!CONFIG_KEYS.includes(key as ConfigKey)) {
      return reply.status(400).send({ error: 'Unknown config key' });
    }

    const user = request.user!;
    await setConfig(key as ConfigKey, String(body.value ?? ''), user.username);
    return reply.send({ success: true, key, value: body.value ?? '' });
  });

  // DELETE /api/admin/config/:key — clear a key (reverts to env default)
  fastify.delete('/config/:key', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const { key } = request.params as { key: string };

    if (!CONFIG_KEYS.includes(key as ConfigKey)) {
      return reply.status(400).send({ error: 'Unknown config key' });
    }

    await deleteConfig(key as ConfigKey);
    return reply.send({ success: true, key });
  });
}
