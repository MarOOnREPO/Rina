import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
import { broadcastToPartner } from '../services/broadcast.js';

function isValidDateString(str: string): boolean {
  const d = new Date(str);
  return !isNaN(d.getTime()) && str === d.toISOString().split('T')[0];
}

const entrySchema = z.object({
  date: z.string().refine(isValidDateString, { message: 'Invalid date format or value' }),
  flowIntensity: z.number().int().min(0).max(4).optional(),
  symptoms: z.array(z.string().max(50)).max(20).optional(),
  temperature: z.number().min(30).max(45).optional(),
  notes: z.string().max(1000).optional()
});

const updateSchema = entrySchema.partial().omit({ date: true });

export default async function cycleRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // List cycle entries for authenticated user
  fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const { from, to } = request.query as { from?: string; to?: string };
      const entries = await prisma.cycleEntry.findMany({
        where: {
          userId: request.user!.id,
          ...(from || to
            ? {
                date: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {})
                }
              }
            : {})
        },
        orderBy: { date: 'desc' }
      });
      return reply.send({ entries });
    } catch (error) {
      console.error('[Cycle Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch cycle entries' });
    }
  });

  // Get single entry
  fastify.get('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const entry = await prisma.cycleEntry.findFirst({
        where: { id: params.id, userId: request.user!.id }
      });
      if (!entry) {
        return reply.status(404).send({ error: 'Cycle entry not found' });
      }
      return reply.send({ entry });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Cycle Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch cycle entry' });
    }
  });

  // Create or upsert cycle entry (one per day per user)
  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = entrySchema.parse(request.body);
      const entry = await prisma.cycleEntry.upsert({
        where: {
          userId_date: {
            userId: request.user!.id,
            date: new Date(data.date)
          }
        },
        update: {
          flowIntensity: data.flowIntensity,
          symptoms: data.symptoms,
          temperature: data.temperature,
          notes: data.notes
        },
        create: {
          userId: request.user!.id,
          date: new Date(data.date),
          flowIntensity: data.flowIntensity,
          symptoms: data.symptoms,
          temperature: data.temperature,
          notes: data.notes
        }
      });
      await broadcastToPartner(request.user!.id, { type: 'cycle', action: 'created', data: entry });
      return reply.status(201).send({ entry });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Cycle Error]', error);
      return reply.status(500).send({ error: 'Failed to create cycle entry' });
    }
  });

  // Update cycle entry
  fastify.patch('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const data = updateSchema.parse(request.body);

      const existing = await prisma.cycleEntry.findFirst({
        where: { id: params.id, userId: request.user!.id }
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Cycle entry not found' });
      }

      const entry = await prisma.cycleEntry.update({
        where: { id: params.id },
        data: {
          ...(data.flowIntensity !== undefined && { flowIntensity: data.flowIntensity }),
          ...(data.symptoms !== undefined && { symptoms: data.symptoms }),
          ...(data.temperature !== undefined && { temperature: data.temperature }),
          ...(data.notes !== undefined && { notes: data.notes })
        }
      });
      await broadcastToPartner(request.user!.id, { type: 'cycle', action: 'updated', data: entry });
      return reply.send({ entry });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Cycle Error]', error);
      return reply.status(500).send({ error: 'Failed to update cycle entry' });
    }
  });

  // Delete cycle entry
  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);
      const existing = await prisma.cycleEntry.findFirst({
        where: { id: params.id, userId: request.user!.id }
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Cycle entry not found' });
      }
      await prisma.cycleEntry.delete({ where: { id: params.id } });
      await broadcastToPartner(request.user!.id, { type: 'cycle', action: 'deleted', data: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Cycle Error]', error);
      return reply.status(500).send({ error: 'Failed to delete cycle entry' });
    }
  });
}
