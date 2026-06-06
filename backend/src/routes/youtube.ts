import type { FastifyInstance } from 'fastify';
import { getConfig } from '../services/config.js';

export default async function youtubeRoutes(fastify: FastifyInstance) {
  fastify.get('/search', async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length === 0) {
      return reply.status(400).send({ error: 'Query required' });
    }

    const apiKey = await getConfig('YOUTUBE_API_KEY');
    if (!apiKey || apiKey.startsWith('your_')) {
      return reply.status(503).send({ error: 'YouTube API key not configured' });
    }

    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(q)}&key=${apiKey}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        const errData = await searchRes.json().catch(() => ({})) as Record<string, any>;
        console.error('[YouTube Search] API error:', errData);
        return reply.status(502).send({ error: 'YouTube API error', details: errData.error?.message });
      }

      const searchData = await searchRes.json() as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } } }> };
      const items = searchData.items || [];

      if (items.length === 0) {
        return reply.send([]);
      }

      // Fetch durations in one batch call
      const videoIds = items.map((i: any) => i.id?.videoId).filter(Boolean).join(',');
      const durationMap = new Map<string, string>();

      if (videoIds) {
        const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json() as { items?: Array<{ id: string; contentDetails?: { duration?: string } }> };
          for (const v of detailsData.items || []) {
            durationMap.set(v.id, v.contentDetails?.duration || 'PT0S');
          }
        }
      }

      // Parse ISO 8601 duration to seconds
      function parseDuration(iso: string): number {
        const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!m) return 0;
        const h = parseInt(m[1] || '0', 10);
        const min = parseInt(m[2] || '0', 10);
        const s = parseInt(m[3] || '0', 10);
        return h * 3600 + min * 60 + s;
      }

      const results = items.map((item: any) => ({
        videoId: item.id?.videoId || '',
        title: item.snippet?.title || '',
        author: item.snippet?.channelTitle || '',
        lengthSeconds: parseDuration(durationMap.get(item.id?.videoId) || 'PT0S'),
        videoThumbnails: [
          { url: item.snippet?.thumbnails?.medium?.url || `https://img.youtube.com/vi/${item.id?.videoId}/mqdefault.jpg`, quality: 'mqdefault' }
        ]
      }));

      return reply.send(results);
    } catch (err: any) {
      console.error('[YouTube Search Proxy] Error:', err.message);
      return reply.status(502).send({ error: 'Failed to search YouTube' });
    }
  });
}
