import 'dotenv/config';
import { createServer } from 'http';
import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from './src/services/prisma.js';
import { redis, setupSocketAdapter } from './src/services/redis.js';
import { createYjsWSS } from './src/services/yjs-server.js';
import { authPlugin, verifyToken } from './src/middleware/auth.js';
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
// ─── Configuration ─────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const COOKIE_NAME = 'rina_auth_token';
// ─── HTTP Server & Fastify ─────────────────────────────────────
const server = createServer();
const app = fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024,
    serverFactory: (handler) => {
        server.on('request', handler);
        return server;
    }
});
// ─── Plugins ───────────────────────────────────────────────────
await app.register(cors, {
    origin: NODE_ENV === 'production'
        ? ['https://your-domain.com']
        : ['http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
});
await app.register(helmet, {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
});
await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET || 'rina-dev-secret-min-32-chars-long!!',
    parseOptions: {}
});
await app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
    redis,
    keyGenerator: (req) => req.ip,
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
        origin: NODE_ENV === 'production'
            ? ['https://your-domain.com']
            : ['http://localhost:5173', 'http://localhost:4173'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});
setupSocketAdapter(io);
// Socket.io Authentication Middleware
io.use((socket, next) => {
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
    }
    catch {
        next(new Error('Authentication error: Invalid token'));
    }
});
// ─── Presence & Socket State (with Redis fallback) ─────────────
const userSockets = new Map();
const userPresence = new Map();
io.on('connection', (socket) => {
    const user = socket.data.user;
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
    socket.on('typing:start', (data) => {
        userPresence.set(user.username, { status: 'typing', lastSeen: new Date() });
        socket.to(data.channel).emit('typing:start', {
            username: user.username,
            displayName: user.displayName
        });
    });
    socket.on('typing:stop', (data) => {
        userPresence.set(user.username, { status: 'online', lastSeen: new Date() });
        socket.to(data.channel).emit('typing:stop', {
            username: user.username,
            displayName: user.displayName
        });
    });
    // ─── Chat Relay ────────────────────────────────────────────
    socket.on('chat:message', (msg) => {
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
    socket.on('webrtc:offer', (data) => {
        const targetSocket = userSockets.get(data.target);
        if (targetSocket) {
            io.to(targetSocket).emit('webrtc:offer', {
                sender: user.username,
                senderDisplayName: user.displayName,
                offer: data.offer
            });
        }
    });
    socket.on('webrtc:answer', (data) => {
        const targetSocket = userSockets.get(data.target);
        if (targetSocket) {
            io.to(targetSocket).emit('webrtc:answer', {
                sender: user.username,
                senderDisplayName: user.displayName,
                answer: data.answer
            });
        }
    });
    socket.on('webrtc:ice-candidate', (data) => {
        const targetSocket = userSockets.get(data.target);
        if (targetSocket) {
            io.to(targetSocket).emit('webrtc:ice-candidate', {
                sender: user.username,
                candidate: data.candidate
            });
        }
    });
    // ─── Listen Together (Synced Media) ────────────────────────
    socket.on('media:sync', (data) => {
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
    // ─── Disconnection ─────────────────────────────────────────
    socket.on('disconnect', (reason) => {
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
// ─── Yjs WebSocket Server ──────────────────────────────────────
const yjsWss = createYjsWSS();
server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/yjs')) {
        yjsWss.handleUpgrade(request, socket, head, (ws) => {
            yjsWss.emit('connection', ws, request);
        });
    }
});
// ─── API Routes ────────────────────────────────────────────────
app.get('/api/health', async (_request, reply) => {
    await reply.status(200).send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV
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
// ─── Global Error Handler ──────────────────────────────────────
app.setErrorHandler((error, _request, reply) => {
    console.error('[Fastify Error]', error);
    reply.status(500).send({
        error: NODE_ENV === 'production' ? 'Internal server error' : error.message
    });
});
// 404 Handler
app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: 'Resource not found' });
});
// ─── Graceful Startup & Shutdown ───────────────────────────────
const startServer = async () => {
    try {
        await prisma.$connect();
        console.log('[Prisma] Database connected successfully');
        await app.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`[Server] HTTP server running on port ${PORT} (${NODE_ENV})`);
        console.log(`[Socket.io] WebSocket server initialized at path /socket.io`);
        console.log(`[Yjs] WebSocket server initialized at path /yjs`);
    }
    catch (error) {
        console.error('[Fatal] Failed to start server:', error);
        process.exit(1);
    }
};
const gracefulShutdown = async (signal) => {
    console.log(`\n[Shutdown] ${signal} received. Initiating graceful shutdown...`);
    io.close(() => {
        console.log('[Socket.io] All socket connections closed');
    });
    yjsWss.close(() => {
        console.log('[Yjs] All websocket connections closed');
    });
    await app.close();
    await prisma.$disconnect();
    console.log('[Prisma] Database connection closed');
    server.close(() => {
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
//# sourceMappingURL=server.js.map