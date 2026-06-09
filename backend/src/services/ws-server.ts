import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer, IncomingMessage } from 'http';
import { presence, redis } from './redis.js';
import { verifyToken, type JWTPayload } from '../middleware/auth.js';
import { getPartner } from './partnership.js';
import { prisma } from './prisma.js';
import { sendPushToUser } from './push.js';

interface WSClient {
  ws: WebSocket;
  user: JWTPayload;
  socketId: string;
  heartbeatTimer: NodeJS.Timeout | null;
}

let wss: WebSocketServer | null = null;
const clients = new Map<string, WSClient>();

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

function generateSocketId(): string {
  return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function send(ws: WebSocket, event: string, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, payload }));
  }
}

async function broadcastPresence(username: string, status: string, displayName: string) {
  const payload = {
    username,
    displayName,
    status,
    timestamp: new Date().toISOString()
  };

  // Send to all connected clients (both native WS and Socket.IO users)
  for (const [, client] of clients) {
    if (client.user.username !== username) {
      send(client.ws, 'presence:update', payload);
    }
  }

  // Also broadcast via Redis pub/sub for multi-node
  await redis.publish('rina:presence:broadcast', JSON.stringify(payload));
}

async function sendToPartner(senderId: string, event: string, payload: unknown) {
  const partner = await getPartner(senderId);
  if (!partner) return;

  // Try native WS clients first
  for (const [, client] of clients) {
    if (client.user.username === partner.username) {
      send(client.ws, event, payload);
      return;
    }
  }

  // Fallback to Redis socket ID (Socket.IO or other nodes)
  const partnerSocketId = await presence.getSocket(partner.username);
  if (partnerSocketId && partnerSocketId.startsWith('ws_')) {
    // It's a native WS client on this node
    const client = clients.get(partnerSocketId);
    if (client) {
      send(client.ws, event, payload);
    }
  }
}

async function handleMessage(client: WSClient, msg: { event: string; payload: unknown }) {
  const { user, ws } = client;

  switch (msg.event) {
    case 'heartbeat:ping': {
      await presence.setHeartbeat(user.username);
      await presence.setStatus(user.username, {
        status: 'online',
        lastSeen: new Date().toISOString(),
        displayName: user.displayName
      });
      send(ws, 'heartbeat:pong', { serverTime: Date.now() });

      const partner = await getPartner(user.id);
      if (partner) {
        await broadcastPresence(user.username, 'online', user.displayName);
      }
      break;
    }

    case 'typing:start': {
      await presence.setStatus(user.username, {
        status: 'typing',
        lastSeen: new Date().toISOString(),
        displayName: user.displayName
      });
      await sendToPartner(user.id, 'typing:start', {
        username: user.username,
        displayName: user.displayName
      });
      break;
    }

    case 'typing:stop': {
      await presence.setStatus(user.username, {
        status: 'online',
        lastSeen: new Date().toISOString(),
        displayName: user.displayName
      });
      await sendToPartner(user.id, 'typing:stop', {
        username: user.username,
        displayName: user.displayName
      });
      break;
    }

    case 'chat:message': {
      const msgData = msg.payload as { id: string; content?: string; type?: string; mediaUrl?: string; replyToId?: string };
      // Message is already persisted by REST API; just relay to partner via WS
      await sendToPartner(user.id, 'chat:message', msgData);
      break;
    }

    case 'ping:partner': {
      const partner = await getPartner(user.id);
      if (!partner) return;

      const payload = {
        from: user.displayName,
        fromUsername: user.username,
        timestamp: new Date().toISOString()
      };

      let sent = false;
      for (const [, c] of clients) {
        if (c.user.username === partner.username) {
          send(c.ws, 'ping:received', payload);
          sent = true;
        }
      }

      if (!sent) {
        // Queue offline notification
        try {
          await prisma.notification.create({
            data: {
              userId: partner.id,
              type: 'nudge',
              title: `${user.displayName} is thinking of you`,
              body: 'Your partner sent you a love nudge 💕',
              data: payload
            }
          });
          await sendPushToUser(partner.id, {
            title: `${user.displayName} is thinking of you`,
            body: 'Your partner sent you a love nudge 💕',
            tag: 'rina-nudge',
            url: '/'
          });
        } catch (err) {
          console.error('[WS] Failed to queue offline nudge:', err);
        }
      }
      break;
    }

    case 'webrtc:offer': {
      const data = msg.payload as { target: string; offer: { type: 'offer'; sdp: string } };
      for (const [, c] of clients) {
        if (c.user.username === data.target) {
          send(c.ws, 'webrtc:offer', {
            sender: user.username,
            senderDisplayName: user.displayName,
            offer: data.offer
          });
        }
      }
      break;
    }

    case 'webrtc:answer': {
      const data = msg.payload as { target: string; answer: { type: 'answer'; sdp: string } };
      for (const [, c] of clients) {
        if (c.user.username === data.target) {
          send(c.ws, 'webrtc:answer', {
            sender: user.username,
            senderDisplayName: user.displayName,
            answer: data.answer
          });
        }
      }
      break;
    }

    case 'webrtc:ice-candidate': {
      const data = msg.payload as { target: string; candidate: unknown };
      for (const [, c] of clients) {
        if (c.user.username === data.target) {
          send(c.ws, 'webrtc:ice-candidate', {
            sender: user.username,
            candidate: data.candidate
          });
        }
      }
      break;
    }

    case 'webrtc:decline': {
      const data = msg.payload as { target: string };
      for (const [, c] of clients) {
        if (c.user.username === data.target) {
          send(c.ws, 'webrtc:declined', {
            sender: user.username,
            senderDisplayName: user.displayName
          });
        }
      }
      break;
    }

    case 'webrtc:hangup': {
      const data = msg.payload as { target: string };
      for (const [, c] of clients) {
        if (c.user.username === data.target) {
          send(c.ws, 'webrtc:hungup', {
            sender: user.username,
            senderDisplayName: user.displayName
          });
        }
      }
      break;
    }

    case 'media:sync': {
      const data = msg.payload as { action: string; time: number; videoId: string };
      const partner = await getPartner(user.id);
      if (partner) {
        for (const [, c] of clients) {
          if (c.user.username === partner.username) {
            send(c.ws, 'media:sync', {
              ...data,
              sender: user.username,
              senderDisplayName: user.displayName,
              serverTime: Date.now()
            });
          }
        }
      }
      break;
    }

    case 'youtube:join': {
      // Track in a simple Set per user for youtube sync
      // This is handled by the existing Socket.IO room mechanism
      break;
    }

    case 'youtube:sync': {
      const data = msg.payload as { action: string; time: number; videoId: string };
      for (const [, c] of clients) {
        if (c.user.username !== user.username) {
          send(c.ws, 'youtube:sync', {
            ...data,
            sender: user.username,
            senderDisplayName: user.displayName,
            serverTime: Date.now()
          });
        }
      }
      break;
    }

    default:
      console.log('[WS] Unknown event:', msg.event);
  }
}

async function handleDisconnect(client: WSClient) {
  const { user, socketId } = client;
  console.log('[WS] User disconnected:', user.id);

  try {
    const remaining = await presence.removeUserSocket(user.username, socketId);

    if (remaining === 0) {
      const currentSocketId = await presence.getSocket(user.username);
      if (currentSocketId === socketId) {
        await presence.delSocket(user.username);
      }
      await presence.setStatus(user.username, {
        status: 'offline',
        lastSeen: new Date().toISOString(),
        displayName: user.displayName
      });

      await broadcastPresence(user.username, 'offline', user.displayName);
    }
  } catch (err) {
    console.error('[WS] Failed to cleanup presence on disconnect:', err);
  }

  clients.delete(socketId);
}

export function createWsServer(server: HTTPServer): void {
  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws: WebSocket, _req: IncomingMessage, user: JWTPayload) => {
    const socketId = generateSocketId();
    console.log('[WS] User connected:', user.id, 'socket:', socketId);

    const client: WSClient = {
      ws,
      user,
      socketId,
      heartbeatTimer: null
    };

    clients.set(socketId, client);

    try {
      await presence.addUserSocket(user.username, socketId);
      await presence.setSocket(user.username, socketId);
      await presence.setStatus(user.username, {
        status: 'online',
        lastSeen: new Date().toISOString(),
        displayName: user.displayName
      });
      await presence.setHeartbeat(user.username);

      await broadcastPresence(user.username, 'online', user.displayName);

      // Send current partner status if online
      const partner = await getPartner(user.id);
      if (partner) {
        const partnerStatus = await presence.getStatus(partner.username);
        if (partnerStatus) {
          send(ws, 'presence:update', {
            username: partner.username,
            displayName: partnerStatus.displayName,
            status: partnerStatus.status,
            timestamp: partnerStatus.lastSeen
          });
        }
      }
    } catch (err) {
      console.error('[WS] Failed to initialize presence:', err);
    }

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { event: string; payload: unknown };
        await handleMessage(client, msg);
      } catch {
        // ignore invalid messages
      }
    });

    ws.on('close', () => {
      if (client.heartbeatTimer) {
        clearInterval(client.heartbeatTimer);
      }
      handleDisconnect(client);
    });

    ws.on('error', (err) => {
      console.error('[WS] Socket error:', err);
    });

    // Start server-side heartbeat check
    client.heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        send(ws, 'heartbeat:pong', { serverTime: Date.now() });
      }
    }, 30000);
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/ws')) {
      try {
        const origin = request.headers.origin;
        const allowedOrigins = process.env.NODE_ENV === 'production'
          ? [process.env.CORS_ORIGIN!].filter(Boolean)
          : ['http://localhost:5173', 'http://localhost:4173'];

        if (origin && !allowedOrigins.includes(origin)) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        const cookies = parseCookies(request.headers.cookie || '');
        const COOKIE_NAME = 'rina_auth_token';
        const token = cookies[COOKIE_NAME];

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const payload = verifyToken(token);
        wss!.handleUpgrade(request, socket, head, (ws) => {
          wss!.emit('connection', ws, request, payload);
        });
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
      }
    }
  });

  console.log('[WS] Native WebSocket server initialized at path /ws');
}
