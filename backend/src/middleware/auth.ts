import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('[Fatal] JWT_SECRET must be set and at least 32 characters long');
}
const COOKIE_NAME = 'rina_auth_token';

export interface JWTPayload {
  id: string;
  username: string;
  displayName: string;
  iat?: number;
  exp?: number;
}

// ─── JWT Helpers ─────────────────────────────────────────────────
export const generateToken = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], clockTolerance: 30 }) as JWTPayload;
};

// ─── Fastify Auth Plugin ─────────────────────────────────────────
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('user', undefined);

  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const token =
      request.cookies[COOKIE_NAME] ||
      request.headers.authorization?.split(' ')[1];

    if (token) {
      try {
        request.user = verifyToken(token);
      } catch {
        // Invalid token — leave user undefined, protected routes will reject
      }
    }
  });
});

// ─── Route Guard ─────────────────────────────────────────────────
export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    await reply.status(401).send({ error: 'Authentication required' });
  }
}
