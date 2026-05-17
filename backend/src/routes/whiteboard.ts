import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';

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
      const { id } = request.params as { id: string };
      const session = await prisma.whiteboardSession.findUnique({
        where: { id },
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
      const { id } = request.params as { id: string };
      const data = updateSchema.parse(request.body);

      const existing = await prisma.whiteboardSession.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Whiteboard session not found' });
      }

      const session = await prisma.whiteboardSession.update({
        where: { id },
        data: { name: data.name }
      });
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
      const { id } = request.params as { id: string };
      const existing = await prisma.whiteboardSession.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Whiteboard session not found' });
      }
      await prisma.whiteboardSession.delete({ where: { id } });
      return reply.status(204).send();
    } catch (error) {
      console.error('[Whiteboard Error]', error);
      return reply.status(500).send({ error: 'Failed to delete whiteboard session' });
    }
  });
}
