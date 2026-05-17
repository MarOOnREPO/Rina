import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';

const photoSchema = z.object({
  s3Key: z.string().min(1).max(500),
  thumbnailUrl: z.string().url().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  caption: z.string().max(500).optional(),
  takenAt: z.string().datetime().optional()
});

export default async function scrapbookRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.get('/', { preValidation: [authenticateJWT] }, async (_request, reply) => {
    try {
      const photos = await prisma.scrapbookPhoto.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return reply.send(photos);
    } catch (error) {
      console.error('[Scrapbook Error]', error);
      return reply.status(500).send({ error: 'Failed to fetch photos' });
    }
  });

  fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = photoSchema.parse(request.body);
      const photo = await prisma.scrapbookPhoto.create({
        data: {
          ...data,
          takenAt: data.takenAt ? new Date(data.takenAt) : undefined,
          uploadedBy: request.user!.id
        }
      });
      return reply.status(201).send(photo);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Scrapbook Error]', error);
      return reply.status(500).send({ error: 'Failed to upload photo' });
    }
  });

  fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const paramsSchema = z.object({ id: z.string().cuid() });
      const params = paramsSchema.parse(request.params);

      const existing = await prisma.scrapbookPhoto.findUnique({ where: { id: params.id } });
      if (!existing) {
        return reply.status(404).send({ error: 'Photo not found' });
      }
      if (existing.uploadedBy !== request.user!.id) {
        return reply.status(403).send({ error: 'Not authorized to delete this photo' });
      }

      await prisma.scrapbookPhoto.delete({ where: { id: params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Scrapbook Error]', error);
      return reply.status(500).send({ error: 'Failed to delete photo' });
    }
  });
}
