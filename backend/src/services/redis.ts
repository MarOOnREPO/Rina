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

// ─── Presence & Socket Registry (Redis-backed for multi-node scaling) ──
const SOCKET_TTL = 3600; // 1 hour
const PRESENCE_TTL = 30; // 30 seconds (strict heartbeat)
const HEARTBEAT_INTERVAL = 10000; // 10 seconds

export type PresenceStatus = 'online' | 'away' | 'typing' | 'offline';

export interface PresenceData {
  status: PresenceStatus;
  lastSeen: string;
  displayName: string;
}

export const presence = {
  // Store a single active socket per user (latest wins for direct messaging)
  async setSocket(username: string, socketId: string): Promise<void> {
    await redis.setex(`rina:socket:${username}`, SOCKET_TTL, socketId);
  },

  async getSocket(username: string): Promise<string | null> {
    return redis.get(`rina:socket:${username}`);
  },

  async delSocket(username: string): Promise<void> {
    await redis.del(`rina:socket:${username}`);
  },

  // Multi-tab tracking: add socket to user's set
  async addUserSocket(username: string, socketId: string): Promise<void> {
    await redis.sadd(`rina:sockets:${username}`, socketId);
    await redis.expire(`rina:sockets:${username}`, SOCKET_TTL);
  },

  async removeUserSocket(username: string, socketId: string): Promise<number> {
    await redis.srem(`rina:sockets:${username}`, socketId);
    const remaining = await redis.scard(`rina:sockets:${username}`);
    if (remaining === 0) {
      await redis.del(`rina:sockets:${username}`);
    }
    return remaining;
  },

  async getUserSocketCount(username: string): Promise<number> {
    return redis.scard(`rina:sockets:${username}`);
  },

  async setStatus(username: string, data: PresenceData): Promise<void> {
    await redis.setex(`rina:presence:${username}`, PRESENCE_TTL, JSON.stringify(data));
  },

  async getStatus(username: string): Promise<PresenceData | null> {
    const data = await redis.get(`rina:presence:${username}`);
    if (!data) return null;
    try {
      return JSON.parse(data) as PresenceData;
    } catch {
      return null;
    }
  },

  async setHeartbeat(username: string): Promise<void> {
    await redis.setex(`rina:heartbeat:${username}`, PRESENCE_TTL, Date.now().toString());
  },

  async getHeartbeat(username: string): Promise<number | null> {
    const ts = await redis.get(`rina:heartbeat:${username}`);
    return ts ? parseInt(ts, 10) : null;
  }
};

// ─── Socket.io Redis Adapter ─────────────────────────────────────
export function setupSocketAdapter(io: SocketIOServer): void {
  const pubClient = new Redis(REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3
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

export { HEARTBEAT_INTERVAL };
