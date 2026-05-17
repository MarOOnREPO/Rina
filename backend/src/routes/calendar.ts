import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  type: z.enum(['WORK', 'SHARED']).default('SHARED'),
  allDay: z.boolean().default(false),
  color: z.string().max(7).optional()
});

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export default async function calendarRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const query = querySchema.parse(request.query);
      const where: Record<string, unknown> = { creatorId: request.user!.id };

      if (query.from || query.to) {
        where.startTime = {};
        if (query.from) (where.startTime as Record<string, Date>).gte = new Date(query.from);
        if (query.to) (where.startTime as Record<string, Date>).lte = new Date(query.to);
      }

      const events = await prisma.calendarEvent.findMany({
        where,
        orderBy: { startTime: 'asc' },
        take: 500
      });

      return reply.send(events);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Calendar Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch events' });
    }
  });

  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = eventSchema.parse(request.body);
      const event = await prisma.calendarEvent.create({
        data: {
          ...data,
          creatorId: request.user!.id
        }
      });
      return reply.status(201).send(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Calendar Error]', error);
      return reply.status(500).send({ error: 'Failed to create event' });
    }
  });

  fastify.patch('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const body = eventSchema.partial().parse(request.body);

      const existing = await prisma.calendarEvent.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Event not found' });
      }
      if (existing.creatorId !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to update this event' });
      }

      const event = await prisma.calendarEvent.update({
        where: { id: params.id },
        data: body
      });
      return reply.send(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Calendar Error]', error);
      return reply.status(500).send({ error: 'Failed to update event' });
    }
  });

  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.calendarEvent.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Event not found' });
      }
      if (existing.creatorId !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to delete this event' });
      }

      await prisma.calendarEvent.delete({ where: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Calendar Error]', error);
      return reply.status(500).send({ error: 'Failed to delete event' });
    }
  });
}
