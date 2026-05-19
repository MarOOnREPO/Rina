import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
import { broadcastToPartner } from '../services/broadcast.js';

const createSchema = z.object({
  name: z.string().min(1).max(200)
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional()
});

export default async function whiteboardRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // List all whiteboard sessions
  fastify.get('/', { preValidation: [authenticateJWT] }, async (_request, reply) => {
    try {
      const sessions = await prisma.whiteboardSession.findMany({
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return reply.send({ sessions });
    } catch (error) {
      console.error('[Whiteboard Error]', error);
      return reply.status(500).send({ error: 'Failed to list whiteboard sessions' });
    }
  });

  // Get a single whiteboard session
  fastify.get('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const session = await prisma.whiteboardSession.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          name: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true
        }
      });
      if (!session) {
        return reply.status(404).send({ error: 'Whiteboard session not found' });
      }
      return reply.send({ session });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Whiteboard Error]', error);
      return reply.status(500).send({ error: 'Failed to get whiteboard session' });
    }
  });

  // Create a new whiteboard session
  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = createSchema.parse(request.body);
      const session = await prisma.whiteboardSession.create({
        data: {
          name: data.name,
          createdBy: request.user!.id
        }
      });
      await broadcastToPartner(request.user!.id, { type: 'whiteboard', action: 'created', data: session });
      return reply.status(201).send({ session });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Whiteboard Error]', error);
      return reply.status(500).send({ error: 'Failed to create whiteboard session' });
    }
  });

  // Update a whiteboard session
  fastify.patch('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const data = updateSchema.parse(request.body);

      const existing = await prisma.whiteboardSession.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Whiteboard session not found' });
      }
      if (existing.createdBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to update this whiteboard session' });
      }

      const session = await prisma.whiteboardSession.update({
        where: { id: params.id },
        data: { name: data.name }
      });
      await broadcastToPartner(request.user!.id, { type: 'whiteboard', action: 'updated', data: session });
      return reply.send({ session });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Whiteboard Error]', error);
      return reply.status(500).send({ error: 'Failed to update whiteboard session' });
    }
  });

  // Delete a whiteboard session
  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const existing = await prisma.whiteboardSession.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Whiteboard session not found' });
      }
      if (existing.createdBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to delete this whiteboard session' });
      }
      await prisma.whiteboardSession.delete({ where: { id: params.id } });
      await broadcastToPartner(request.user!.id, { type: 'whiteboard', action: 'deleted', data: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Whiteboard Error]', error);
      return reply.status(500).send({ error: 'Failed to delete whiteboard session' });
    }
  });
}
