import type { FastifyInstance } from 'fastify';
import { getConfig } from '../services/config.js';

export default async function youtubeRoutes(fastify: FastifyInstance) {
  fastify.get('/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length === 0) {
      return reply.status(400).send({ error: 'Query required' });
    }

    const instance = await getConfig('YOUTUBE_INVIOUS_INSTANCE');
    const host = instance || 'vid.puffyan.us';
    const url = `https://${host}/api/v1/search?q=${encodeURIComponent(q)}`;

    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        return reply.status(502).send({ error: `Invidious returned ${res.status}` });
      }
      const data = await res.json();
      return reply.send(data);
    } catch (err: any) {
      console.error('[YouTube Search Proxy] Error:', err.message);
      return reply.status(502).send({ error: 'Failed to reach Invidious instance' });
    }
  });
}
