import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
import { broadcastToPartner } from '../services/broadcast.js';

const goalSchema = z.object({
  title: z.string().min(1).max(200),
  targetAmount: z.number().int().positive(),
  currentAmount: z.number().int().min(0).default(0),
  currency: z.string().max(3).default('EUR'),
  deadline: z.string().datetime().optional(),
  icon: z.string().max(50).optional()
});

const updateSchema = goalSchema.partial().omit({ currentAmount: true });

export default async function goalRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const goals = await prisma.goal.findMany({
        where: { createdBy: request.user!.id },
        orderBy: { createdAt: 'desc' }
      });
      return reply.send(goals);
    } catch (error) {
      console.error('[Goal Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch goals' });
    }
  });

  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = goalSchema.parse(request.body);
      const goal = await prisma.goal.create({
        data: { ...data, createdBy: request.user!.id }
      });
      await broadcastToPartner(request.user!.id, { type: 'goal', action: 'created', data: goal });
      return reply.status(201).send(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Goal Error]', error);
      return reply.status(500).send({ error: 'Failed to create goal' });
    }
  });

  fastify.patch('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const data = updateSchema.parse(request.body);

      const existing = await prisma.goal.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Goal not found' });
      }
      if (existing.createdBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to update this goal' });
      }

      const goal = await prisma.goal.update({
        where: { id: params.id },
        data
      });
      await broadcastToPartner(request.user!.id, { type: 'goal', action: 'updated', data: goal });
      return reply.send(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Goal Error]', error);
      return reply.status(500).send({ error: 'Failed to update goal' });
    }
  });

  fastify.patch('/:id/contribute', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const schema = z.object({ amount: z.number().int().positive() });
      const { amount } = schema.parse(request.body);
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.goal.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Goal not found' });
      }
      if (existing.createdBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to contribute to this goal' });
      }

      const newAmount = existing.currentAmount + amount;
      if (newAmount > existing.targetAmount) {
        return reply.status(400).send({ error: 'Contribution exceeds target amount' });
      }

      const updated = await prisma.goal.updateMany({
        where: {
          id: params.id,
          currentAmount: existing.currentAmount
        },
        data: { currentAmount: newAmount }
      });

      if (updated.count === 0) {
        return reply.status(409).send({ error: 'Goal was updated concurrently, please retry' });
      }

      const goal = await prisma.goal.findUnique({ where: { id: params.id } });
      await broadcastToPartner(request.user!.id, { type: 'goal', action: 'updated', data: goal });
      return reply.send(goal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Goal Error]', error);
      return reply.status(500).send({ error: 'Failed to contribute to goal' });
    }
  });

  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.goal.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Goal not found' });
      }
      if (existing.createdBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to delete this goal' });
      }

      await prisma.goal.delete({ where: { id: params.id } });
      await broadcastToPartner(request.user!.id, { type: 'goal', action: 'deleted', data: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Goal Error]', error);
      return reply.status(500).send({ error: 'Failed to delete goal' });
    }
  });
}
