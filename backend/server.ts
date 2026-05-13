import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

import { verifyToken, type JWTPayload } from './src/middleware/auth.js';
import authRoutes from './src/routes/auth.js';
import calendarRoutes from './src/routes/calendar.js';
import messageRoutes from './src/routes/messages.js';
import movieRoutes from './src/routes/movies.js';
import capsuleRoutes from './src/routes/capsules.js';
import countdownRoutes from './src/routes/countdowns.js';
import goalRoutes from './src/routes/goals.js';
import scrapbookRoutes from './src/routes/scrapbook.js';
import pushRoutes from './src/routes/push.js';

// ─── Configuration ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const COOKIE_NAME = 'rina_auth_token';

// ─── Prisma Client ─────────────────────────────────────────────
export const prisma = new PrismaClient({
  log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

// ─── Express & HTTP Server ─────────────────────────────────────
const app = express();
const httpServer = createServer(app);

// ─── Security Middleware ───────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: NODE_ENV === 'production'
    ? ['https://your-domain.com']
    : ['http://localhost:5173', 'http://localhost:4173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// ─── Rate Limiting ─────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});
app.use(globalLimiter);

// ─── Socket.io Initialization ──────────────────────────────────
const io = new SocketIOServer(httpServer, {
  path: '/socket.io',
  cors: {
    origin: NODE_ENV === 'production'
      ? ['https://your-domain.com']
      : ['http://localhost:5173', 'http://localhost:4173'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket.io Authentication Middleware
io.use((socket: Socket, next: (err?: Error) => void) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie || '';
    const tokenMatch = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    const token = socket.handshake.auth.token || tokenMatch?.[1];

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

// ─── Presence & Socket State Management ────────────────────────
const userSockets = new Map<string, string>();
const userPresence = new Map<string, { status: 'online' | 'away' | 'typing'; lastSeen: Date }>();

// ─── Socket.io Event Handlers ──────────────────────────────────
io.on('connection', (socket: Socket) => {
  const user = socket.data.user as JWTPayload;
  console.log(`[Socket] ${user.displayName} connected (${socket.id})`);

  userSockets.set(user.username, socket.id);
  userPresence.set(user.username, { status: 'online', lastSeen: new Date() });

  // Notify partner of online status
  socket.broadcast.emit('presence:update', {
    username: user.username,
    displayName: user.displayName,
    status: 'online',
    timestamp: new Date().toISOString()
  });

  // ─── Typing Indicators ─────────────────────────────────────
  socket.on('typing:start', (data: { channel: string }) => {
    userPresence.set(user.username, { status: 'typing', lastSeen: new Date() });
    socket.to(data.channel).emit('typing:start', {
      username: user.username,
      displayName: user.displayName
    });
  });

  socket.on('typing:stop', (data: { channel: string }) => {
    userPresence.set(user.username, { status: 'online', lastSeen: new Date() });
    socket.to(data.channel).emit('typing:stop', {
      username: user.username,
      displayName: user.displayName
    });
  });

  // ─── Chat Relay ────────────────────────────────────────────
  socket.on('chat:message', (msg: { id: string }) => {
    const partnerUsername = user.username === 'maroon' ? 'rina' : 'maroon';
    const partnerSocketId = userSockets.get(partnerUsername);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('chat:message', msg);
    }
  });

  // ─── "Thinking of You" Ping ────────────────────────────────
  socket.on('ping:partner', () => {
    const partnerUsername = user.username === 'maroon' ? 'rina' : 'maroon';
    const partnerSocketId = userSockets.get(partnerUsername);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('ping:received', {
        from: user.displayName,
        fromUsername: user.username,
        timestamp: new Date().toISOString()
      });
    }
  });

  // ─── WebRTC Signaling ──────────────────────────────────────
  socket.on('webrtc:offer', (data: { target: string; offer: { type: 'offer'; sdp: string } }) => {
    const targetSocket = userSockets.get(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:offer', {
        sender: user.username,
        senderDisplayName: user.displayName,
        offer: data.offer
      });
    }
  });

  socket.on('webrtc:answer', (data: { target: string; answer: { type: 'answer'; sdp: string } }) => {
    const targetSocket = userSockets.get(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:answer', {
        sender: user.username,
        senderDisplayName: user.displayName,
        answer: data.answer
      });
    }
  });

  socket.on('webrtc:ice-candidate', (data: { target: string; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } }) => {
    const targetSocket = userSockets.get(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('webrtc:ice-candidate', {
        sender: user.username,
        candidate: data.candidate
      });
    }
  });

  // ─── Listen Together (Synced Media) ────────────────────────
  socket.on('media:sync', (data: { action: string; time: number; videoId: string }) => {
    const partnerUsername = user.username === 'maroon' ? 'rina' : 'maroon';
    const partnerSocketId = userSockets.get(partnerUsername);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit('media:sync', {
        ...data,
        sender: user.username,
        senderDisplayName: user.displayName,
        serverTime: Date.now()
      });
    }
  });

  // ─── Yjs Awareness / Canvas Sync ───────────────────────────
  socket.on('yjs:update', (data: { target: string; update: Uint8Array }) => {
    const targetSocket = userSockets.get(data.target);
    if (targetSocket) {
      io.to(targetSocket).emit('yjs:update', {
        sender: user.username,
        update: data.update
      });
    }
  });

  // ─── Disconnection ─────────────────────────────────────────
  socket.on('disconnect', (reason: string) => {
    console.log(`[Socket] ${user.displayName} disconnected (${reason})`);
    userSockets.delete(user.username);
    userPresence.set(user.username, { status: 'away', lastSeen: new Date() });

    socket.broadcast.emit('presence:update', {
      username: user.username,
      displayName: user.displayName,
      status: 'away',
      timestamp: new Date().toISOString()
    });
  });
});

// ─── HTTP Routes ───────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/capsules', capsuleRoutes);
app.use('/api/countdowns', countdownRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/scrapbook', scrapbookRoutes);
app.use('/api/push', pushRoutes);

// ─── Global Error Handling ─────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Express Error]', err);
  res.status(500).json({
    error: NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 Handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Resource not found' });
});

// ─── Graceful Startup & Shutdown ───────────────────────────────
const startServer = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('[Prisma] Database connected successfully');

    httpServer.listen(PORT, () => {
      console.log(`[Server] HTTP server running on port ${PORT} (${NODE_ENV})`);
      console.log(`[Socket.io] WebSocket server initialized at path /socket.io`);
    });
  } catch (error) {
    console.error('[Fatal] Failed to start server:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n[Shutdown] ${signal} received. Initiating graceful shutdown...`);

  io.close(() => {
    console.log('[Socket.io] All socket connections closed');
  });

  await prisma.$disconnect();
  console.log('[Prisma] Database connection closed');

  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
