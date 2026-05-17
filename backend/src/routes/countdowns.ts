import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';

const countdownSchema = z.object({
  title: z.string().min(1).max(200),
  targetDate: z.string().datetime(),
  location: z.string().max(200).optional(),
  imageUrl: z.string().url().optional()
});

const updateSchema = countdownSchema.partial();

export default async function countdownRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/', { preValidation: [authenticateJWT] }, async (_request, reply) => {
    try {
      const countdowns = await prisma.countdown.findMany({
        orderBy: { targetDate: 'asc' }
      });
      return reply.send(countdowns);
    } catch (error) {
      console.error('[Countdown Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch countdowns' });
    }
  });

  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = countdownSchema.parse(request.body);
      const countdown = await prisma.countdown.create({
        data: { ...data, createdBy: request.user!.id }
      });
      return reply.status(201).send(countdown);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Countdown Error]', error);
      return reply.status(500).send({ error: 'Failed to create countdown' });
    }
  });

  fastify.patch('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const data = updateSchema.parse(request.body);

      const existing = await prisma.countdown.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Countdown not found' });
      }
      if (existing.createdBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to update this countdown' });
      }

      const countdown = await prisma.countdown.update({
        where: { id: params.id },
        data
      });
      return reply.send(countdown);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Countdown Error]', error);
      return reply.status(500).send({ error: 'Failed to update countdown' });
    }
  });

  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.countdown.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Countdown not found' });
      }
      if (existing.createdBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to delete this countdown' });
      }

      await prisma.countdown.delete({ where: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Countdown Error]', error);
      return reply.status(500).send({ error: 'Failed to delete countdown' });
    }
  });
}
