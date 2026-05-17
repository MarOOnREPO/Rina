import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';

const messageSchema = z.object({
  content: z.string().min(1).max(4000),
  type: z.enum(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO']).default('TEXT'),
  replyToId: z.string().cuid().optional()
});

const querySchema = z.object({
  limit: z.string().optional(),
  before: z.string().datetime().optional()
});

export default async function messageRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      const limit = Math.min(parseInt(query.limit || '50', 10), 200);
      if (isNaN(limit) || limit < 1) {
        return reply.status(400).send({ error: 'Invalid limit' });
      }

      const messages = await prisma.message.findMany({
        where: query.before ? { createdAt: { lt: new Date(query.before) } } : {},
        orderBy: { createdAt: 'desc' },
        take: limit
      });

      return reply.send(messages);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Message Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch messages' });
    }
  });

  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = messageSchema.parse(request.body);

      if (data.replyToId) {
        const parent = await prisma.message.findUnique({ where: { id: data.replyToId } });
        if (!parent) {
          return reply.status(400).send({ error: 'Reply-to message does not exist' });
        }
      }

      const message = await prisma.message.create({
        data: {
          ...data,
          senderId: request.user!.id
        }
      });
      return reply.status(201).send(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Message Error]', error);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });
}
