import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateJWT } from '../middleware/auth.js';
import crypto from 'crypto';

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
    const iceServers: IceServer[] = [];

    if (COTURN_SECRET) {
      const turnCreds = generateTurnCredentials(request.user!.username);
      if (turnCreds) {
        // TURN-over-TLS on port 443 — multiplexed with HTTPS via Nginx SNI.
        // transport=tcp forces TCP even inside the TLS tunnel, ensuring
        // all media flows over the single TCP 443 connection.
        iceServers.push({
          urls: 'turns:turn.devopsya.com:443?transport=tcp',
          username: turnCreds.username,
          credential: turnCreds.credential
        });
      }
    }

    // NOTE: STUN servers are intentionally omitted here.
    // The frontend sets iceTransportPolicy: 'relay', which ignores STUN
    // candidates anyway. Removing STUN prevents the client from leaking
    // direct (host/srflx) candidates that DPI could fingerprint.

    return reply.send({ iceServers });
  });
}
