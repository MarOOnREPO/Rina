import { Redis } from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as SocketIOServer } from 'socket.io';

const REDIS_URL = process.env.REDIS_URL!;
if (!REDIS_URL) {
  console.error('[Fatal] REDIS_URL must be set');
  process.exit(1);
}

// ─── Core Redis Client ───────────────────────────────────────────
export const redis = new Redis(REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

// ─── Cache Helpers ───────────────────────────────────────────────
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  },

  async del(key: string): Promise<void> {
    await redis.del(key);
  },

  async keys(pattern: string): Promise<string[]> {
    return redis.keys(pattern);
  }
};

// ─── Socket.io Redis Adapter ─────────────────────────────────────
export function setupSocketAdapter(io: SocketIOServer): void {
  const pubClient = new Redis(REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false
  });
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
