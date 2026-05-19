import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
import { broadcastToPartner } from '../services/broadcast.js';

const capsuleSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  encryptedData: z.string().min(1),
  mediaType: z.enum(['audio', 'video', 'text']),
  unlockAt: z.string().datetime()
});

const updateSchema = capsuleSchema.partial();

export default async function capsuleRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const capsules = await prisma.timeCapsule.findMany({
        where: { creatorId: request.user!.id },
        orderBy: { unlockAt: 'asc' }
      });
      return reply.send(capsules);
    } catch (error) {
      console.error('[Capsule Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch capsules' });
    }
  });

  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = capsuleSchema.parse(request.body);
      const capsule = await prisma.timeCapsule.create({
        data: {
          ...data,
          creatorId: request.user!.id
        }
      });
      await broadcastToPartner(request.user!.id, { type: 'capsule', action: 'created', data: capsule });
      return reply.status(201).send(capsule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Capsule Error]', error);
      return reply.status(500).send({ error: 'Failed to create capsule' });
    }
  });

  fastify.patch('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const data = updateSchema.parse(request.body);

      const existing = await prisma.timeCapsule.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Capsule not found' });
      }
      if (existing.creatorId !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to update this capsule' });
      }

      const capsule = await prisma.timeCapsule.update({
        where: { id: params.id },
        data
      });
      await broadcastToPartner(request.user!.id, { type: 'capsule', action: 'updated', data: capsule });
      return reply.send(capsule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Capsule Error]', error);
      return reply.status(500).send({ error: 'Failed to update capsule' });
    }
  });

  fastify.get('/:id/unlock', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const capsule = await prisma.timeCapsule.findUnique({ where: { id: params.id } });
      if (!capsule) {
        return reply.status(404).send({ error: 'Capsule not found' });
      }

      if (capsule.creatorId !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to unlock this capsule' });
      }

      const now = new Date();
      if (now < capsule.unlockAt) {
        const diff = capsule.unlockAt.getTime() - now.getTime();
        return reply.status(403).send({
          error: 'Capsule is still locked',
          unlocksIn: diff,
          unlockAt: capsule.unlockAt
        });
      }

      await prisma.timeCapsule.update({
        where: { id: params.id },
        data: { openedAt: now }
      });

      return reply.send({ data: capsule.encryptedData, decrypted: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Capsule Error]', error);
      return reply.status(500).send({ error: 'Failed to unlock capsule' });
    }
  });

  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.timeCapsule.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Capsule not found' });
      }
      if (existing.creatorId !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to delete this capsule' });
      }

      await prisma.timeCapsule.delete({ where: { id: params.id } });
      await broadcastToPartner(request.user!.id, { type: 'capsule', action: 'deleted', data: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Capsule Error]', error);
      return reply.status(500).send({ error: 'Failed to delete capsule' });
    }
  });
}
