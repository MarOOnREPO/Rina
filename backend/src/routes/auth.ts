import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { generateToken, authenticateJWT } from '../middleware/auth.js';
import { prisma } from '../services/prisma.js';

const COOKIE_NAME = 'rina_auth_token';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Default passwords (change after first login or migrate to DB-managed auth):
//   maroon -> maroonpass2026!
//   rina   -> rinapass2026!
const AUTHORIZED_USERS: Record<string, { username: string; passwordHash: string; displayName: string }> = {
  maroon: {
    username: 'maroon',
    passwordHash: '$2a$12$uuyxtsi5WMRosmaTC2SO6urMOzB5HMu.DOL6.TihhNn0sgkT9A2yC',
    displayName: 'MarOOn'
  },
  rina: {
    username: 'rina',
    passwordHash: '$2a$12$E1hGSTE7Zc0HYrgRFYZ6suuIH4LWNoIpnn6.W3QKhTa7w64OT/dqa',
    displayName: 'Rina'
  }
};

export default async function authRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes'
      }
    }
  }, async (request, reply) => {
    try {
      const body = request.body as { username?: string; password?: string };
      const { username, password } = body;
      const normalizedUser = username?.toString().toLowerCase().trim();

      const user = AUTHORIZED_USERS[normalizedUser || ''];
      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password || '', user.passwordHash);
      if (!validPassword) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      let dbUser = await prisma.user.findUnique({ where: { username: user.username } });
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: { username: user.username, displayName: user.displayName }
        });
      }

      const token = generateToken({
        id: dbUser.id,
        username: user.username,
        displayName: user.displayName
      });

      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      return reply.status(200).send({ user: { username: user.username, displayName: user.displayName } });
    } catch (error) {
      console.error('[Auth Error]', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.post('/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.status(200).send({ message: 'Logged out successfully' });
  });

  fastify.get('/me', { preValidation: [authenticateJWT] }, async (request, reply) => {
    return reply.status(200).send({ user: request.user });
  });
}
