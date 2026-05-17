import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// ─── Core Redis Client ───────────────────────────────────────────
export const redis = new Redis(REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3
});
redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
});
redis.on('connect', () => {
    console.log('[Redis] Connected successfully');
});
// ─── Cache Helpers ───────────────────────────────────────────────
export const cache = {
    async get(key) {
        const data = await redis.get(key);
        if (!data)
            return null;
        try {
            return JSON.parse(data);
        }
        catch {
            return null;
        }
    },
    async set(key, value, ttlSeconds = 300) {
        await redis.setex(key, ttlSeconds, JSON.stringify(value));
    },
    async del(key) {
        await redis.del(key);
    },
    async keys(pattern) {
        return redis.keys(pattern);
    }
};
// ─── Socket.io Redis Adapter ─────────────────────────────────────
export function setupSocketAdapter(io) {
    const pubClient = new Redis(REDIS_URL);
    const subClient = pubClient.duplicate();
    pubClient.on('error', (err) => {
        console.error('[Redis Pub] Connection error:', err.message);
    });
    subClient.on('error', (err) => {
        console.error('[Redis Sub] Connection error:', err.message);
    });
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket.io] Redis adapter initialized');
}
//# sourceMappingURL=redis.js.map