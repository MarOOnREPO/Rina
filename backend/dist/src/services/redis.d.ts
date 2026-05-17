import { Redis } from 'ioredis';
import type { Server as SocketIOServer } from 'socket.io';
export declare const redis: Redis;
export declare const cache: {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    keys(pattern: string): Promise<string[]>;
};
export declare function setupSocketAdapter(io: SocketIOServer): void;
//# sourceMappingURL=redis.d.ts.map