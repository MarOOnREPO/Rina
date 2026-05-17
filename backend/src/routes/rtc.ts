import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';
import crypto from 'crypto';

const COTURN_REALM = process.env.COTURN_REALM || 'localhost';
const COTURN_SECRET = process.env.COTURN_SECRET || '';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// Generate time-limited HMAC-based TURN credentials
function generateTurnCredentials(username: string): { username: string; credential: string } | null {
  if (!COTURN_SECRET) {
    return null;
  }

  const timestamp = Math.floor(Date.now() / 1000) + 3600; // 1-hour validity
  const turnUsername = `${timestamp}:${username}`;
  const hmac = crypto.createHmac('sha1', COTURN_SECRET);
  hmac.update(turnUsername);
  const credential = hmac.digest('base64');

  return { username: turnUsername, credential };
}

export default async function rtcRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/ice-servers', { preValidation: [authenticateJWT] }, async (request, reply) => {
    const iceServers: IceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];

    if (COTURN_SECRET) {
      const turnCreds = generateTurnCredentials(request.user!.username);
      if (turnCreds) {
        iceServers.push(
          {
            urls: `turn:${COTURN_REALM}:3478`,
            username: turnCreds.username,
            credential: turnCreds.credential
          },
          {
            urls: `turns:${COTURN_REALM}:5349`,
            username: turnCreds.username,
            credential: turnCreds.credential
          }
        );
      }
    }

    return reply.send({ iceServers });
  });
}
