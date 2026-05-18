import 'dotenv/config';
import { createServer } from 'http';
import fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { Server as SocketIOServer, Socket } from 'socket.io';

import { prisma } from './src/services/prisma.js';
import { redis, setupSocketAdapter, presence } from './src/services/redis.js';
import { createYjsWSS } from './src/services/yjs-server.js';
import { authPlugin, verifyToken, type JWTPayload } from './src/middleware/auth.js';

import authRoutes from './src/routes/auth.js';
import calendarRoutes from './src/routes/calendar.js';
import messageRoutes from './src/routes/messages.js';
import movieRoutes from './src/routes/movies.js';
import capsuleRoutes from './src/routes/capsules.js';
import countdownRoutes from './src/routes/countdowns.js';
import goalRoutes from './src/routes/goals.js';
import scrapbookRoutes from './src/routes/scrapbook.js';
import pushRoutes from './src/routes/push.js';
import uploadRoutes from './src/routes/uploads.js';
import rtcRoutes from './src/routes/rtc.js';
import whiteboardRoutes from './src/routes/whiteboard.js';
import cycleRoutes from './src/routes/cycle.js';

// ─── Secret Validation ─────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[Fatal] JWT_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

const COOKIE_SECRET = process.env.COOKIE_SECRET;
if (!COOKIE_SECRET || COOKIE_SECRET.length < 32) {
  console.error('[Fatal] COOKIE_SECRET must be set and at least 32 characters long');
  process.exit(1);
}

const MAROON_PASSWORD_HASH = process.env.MAROON_PASSWORD_HASH;
const RINA_PASSWORD_HASH = process.env.RINA_PASSWORD_HASH;
if (!MAROON_PASSWORD_HASH || !RINA_PASSWORD_HASH) {
  console.error('[Fatal] MAROON_PASSWORD_HASH and RINA_PASSWORD_HASH must be set');
  process.exit(1);
}

// ─── Configuration ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const COOKIE_NAME = 'rina_auth_token';

if (NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('[Fatal] CORS_ORIGIN must be set in production');
  process.exit(1);
}

const allowedOrigins = NODE_ENV === 'production'
  ? [process.env.CORS_ORIGIN!]
  : ['http://localhost:5173', 'http://localhost:4173'];

// ─── Cookie Parser Helper ──────────────────────────────────────
function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  header.split(';').forEach((cookie) => {
    const idx = cookie.indexOf('=');
    if (idx > 0) {
      const name = cookie.slice(0, idx).trim();
      const value = cookie.slice(idx + 1).trim();
      cookies[name] = decodeURIComponent(value);
    }
  });
  return cookies;
}

// ─── HTTP Server & Fastify ─────────────────────────────────────
const server = createServer();

const app: FastifyInstance = fastify({
  logger: {
    level: NODE_ENV === 'production' ? 'info' : 'debug',
    redact: ['req.headers.authorization', 'req.headers.cookie']
  },
  bodyLimit: 50 * 1024 * 1024,
  trustProxy: 1,
  serverFactory: (handler) => {
    server.on('request', handler);
    return server;
  }
});

// ─── Plugins ───────────────────────────────────────────────────
await app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

await app.register(helmet, {
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
});

await app.register(cookie, {
  secret: COOKIE_SECRET,
  parseOptions: {}
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes',
  redis,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip;
  },
  errorResponseBuilder: (_req, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Retry in ${context.after}`
  })
});

await app.register(authPlugin);

// ─── Socket.io ─────────────────────────────────────────────────
const io = new SocketIOServer(server, {
  path: '/socket.io',
  cors: {
    origin: allowedOrigins,
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

setupSocketAdapter(io);

// Socket.io Authentication Middleware
io.use((socket: Socket, next: (err?: Error) => void) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const cookies = parseCookies(cookieHeader);
    const token = socket.handshake.auth.token || cookies[COOKIE_NAME];

    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const payload = verifyToken(token);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('Authentication error: Invalid token'));
  }
});

// ─── Presence & Socket State ───────────────────────────────────
// Redis-backed for horizontal scaling and survival across restarts.

io.on('connection', async (socket: Socket) => {
  const user = socket.data.user as JWTPayload;
  console.log(`[Socket] ${user.displayName} connected (${socket.id})`);

  try {
    await presence.setSocket(user.username, socket.id);
    await presence.setStatus(user.username, { status: 'online', lastSeen: new Date(), displayName: user.displayName });

    // Notify partner of online status
    socket.broadcast.emit('presence:update', {
      username: user.username,
      displayName: user.displayName,
      status: 'online',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Socket] Failed to initialize presence:', err);
  }

  // ─── Typing Indicators ─────────────────────────────────────
  socket.on('typing:start', async (data: { channel: string }) => {
    try {
      await presence.setStatus(user.username, { status: 'typing', lastSeen: new Date(), displayName: user.displayName });
    } catch (err) {
      console.error('[Socket] Failed to set typing status:', err);
    }
    socket.to(data.channel).emit('typing:start', {
      username: user.username,
      displayName: user.displayName
    });
  });

  socket.on('typing:stop', async (data: { channel: string }) => {
    try {
      await presence.setStatus(user.username, { status: 'online', lastSeen: new Date(), displayName: user.displayName });
    } catch (err) {
      console.error('[Socket] Failed to set online status:', err);
    }
    socket.to(data.channel).emit('typing:stop', {
      username: user.username,
      displayName: user.displayName
    });
  });

  // ─── Chat Relay & Persistence ──────────────────────────────
  socket.on('chat:message', async (msg: { id: string; content?: string }) => {
    try {
      if (msg.content && user.id) {
        await prisma.message.create({
          data: {
            senderId: user.id,
            content: msg.content,
            type: 'TEXT'
          }
        });
      }
    } catch (err) {
      console.error('[Socket] Failed to persist message:', err);
    }

    const partnerUsername = user.username === 'maroon' ? 'rina' : 'maroon';
    const partnerSocketId = await presence.getSocket(partnerUsername);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('chat:message', msg);
    }
  });

  // ─── "Thinking of You" Ping ────────────────────────────────
  socket.on('ping:partner', async () => {
    const partnerUsername = user.username === 'maroon' ? 'rina' : 'maroon';
    const partnerSocketId = await presence.getSocket(partnerUsername);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('ping:received', {
        from: user.displayName,
        fromUsername: user.username,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ─── WebRTC Signaling ──────────────────────────────────────
  socket.on('webrtc:offer', async (data: { target: string; offer: { type: 'offer'; sdp: string } }) => {
    const targetSocket = await presence.getSocket(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:offer', {
        sender: user.username,
        senderDisplayName: user.displayName,
        offer: data.offer
      });
    }
  });

  socket.on('webrtc:answer', async (data: { target: string; answer: { type: 'answer'; sdp: string } }) => {
    const targetSocket = await presence.getSocket(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:answer', {
        sender: user.username,
        senderDisplayName: user.displayName,
        answer: data.answer
      });
    }
  });

  socket.on('webrtc:ice-candidate', async (data: { target: string; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } }) => {
    const targetSocket = await presence.getSocket(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:ice-candidate', {
        sender: user.username,
        candidate: data.candidate
      });
    }
  });

  socket.on('webrtc:decline', async (data: { target: string }) => {
    const targetSocket = await presence.getSocket(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:declined', {
        sender: user.username,
        senderDisplayName: user.displayName
      });
    }
  });

  // ─── Listen Together (Synced Media) ────────────────────────
  socket.on('media:sync', async (data: { action: string; time: number; videoId: string }) => {
    const partnerUsername = user.username === 'maroon' ? 'rina' : 'maroon';
    const partnerSocketId = await presence.getSocket(partnerUsername);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('media:sync', {
        ...data,
        sender: user.username,
        senderDisplayName: user.displayName,
        serverTime: Date.now()
      });
    }
  });

  // ─── Disconnection ─────────────────────────────────────────
  socket.on('disconnect', async (reason: string) => {
    console.log(`[Socket] ${user.displayName} disconnected (${reason})`);
    try {
      const currentSocketId = await presence.getSocket(user.username);
      if (currentSocketId === socket.id) {
        await presence.delSocket(user.username);
      }
      await presence.setStatus(user.username, { status: 'away', lastSeen: new Date(), displayName: user.displayName });

      socket.broadcast.emit('presence:update', {
        username: user.username,
        displayName: user.displayName,
        status: 'away',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[Socket] Failed to cleanup presence on disconnect:', err);
    }
  });
});

// ─── Yjs WebSocket Server ──────────────────────────────────────
const yjsWss = createYjsWSS();

server.on('upgrade', (request, socket, head) => {
  if (request.url?.startsWith('/yjs')) {
    try {
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      const cookies = parseCookies(request.headers.cookie || '');
      const token = cookies[COOKIE_NAME];
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const payload = verifyToken(token);
      yjsWss.handleUpgrade(request, socket, head, (ws) => {
        (ws as unknown as Record<string, unknown>).userId = payload.id;
        yjsWss.emit('connection', ws, request);
      });
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }
});

// ─── API Routes ────────────────────────────────────────────────
app.get('/api/health', async (_request, reply) => {
  await reply.status(200).send({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(calendarRoutes, { prefix: '/api/calendar' });
await app.register(messageRoutes, { prefix: '/api/messages' });
await app.register(movieRoutes, { prefix: '/api/movies' });
await app.register(capsuleRoutes, { prefix: '/api/capsules' });
await app.register(countdownRoutes, { prefix: '/api/countdowns' });
await app.register(goalRoutes, { prefix: '/api/goals' });
await app.register(scrapbookRoutes, { prefix: '/api/scrapbook' });
await app.register(pushRoutes, { prefix: '/api/push' });
await app.register(uploadRoutes, { prefix: '/api/upload' });
await app.register(rtcRoutes, { prefix: '/api/rtc' });
await app.register(whiteboardRoutes, { prefix: '/api/whiteboard' });
await app.register(cycleRoutes, { prefix: '/api/cycle' });

// ─── Global Error Handler ──────────────────────────────────────
app.setErrorHandler((error, _request, reply) => {
  console.error('[Fastify Error]', error);
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    error: NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
});

// 404 Handler
app.setNotFoundHandler((_request, reply) => {
  reply.status(404).send({ error: 'Resource not found' });
});

// ─── Graceful Startup & Shutdown ───────────────────────────────
const startServer = async (): Promise<void> => {
  try {
    // Retry Prisma connection up to 5 times (Postgres may need a moment)
    for (let i = 0; i < 5; i++) {
      try {
        await prisma.$connect();
        app.log.info('[Prisma] Database connected successfully');
        break;
      } catch (err) {
        if (i === 4) throw err;
        app.log.warn(`[Prisma] Connection attempt ${i + 1} failed, retrying in 3s...`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`[Server] HTTP server running on port ${PORT} (${NODE_ENV})`);
    app.log.info('[Socket.io] WebSocket server initialized at path /socket.io');
    app.log.info('[Yjs] WebSocket server initialized at path /yjs');
  } catch (error) {
    app.log.error(`[Fatal] Failed to start server: ${error}`);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n[Shutdown] ${signal} received. Initiating graceful shutdown...`);

  const forceExit = setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10000);

  try {
    await new Promise<void>((resolve, reject) => {
      io.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('[Socket.io] All socket connections closed');

    await new Promise<void>((resolve, reject) => {
      yjsWss.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('[Yjs] All websocket connections closed');

    await app.close();
    console.log('[Fastify] Server closed');

    await prisma.$disconnect();
    console.log('[Prisma] Database connection closed');

    clearTimeout(forceExit);
    process.exit(0);
  } catch (error) {
    console.error('[Shutdown] Error during shutdown:', error);
    clearTimeout(forceExit);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
