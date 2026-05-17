import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
export default async function scrapbookRoutes(fastify, _opts) {
    fastify.get('/', { preValidation: [authenticateJWT] }, async (_request, reply) => {
        try {
            const photos = await prisma.scrapbookPhoto.findMany({
                orderBy: { createdAt: 'desc' }
            });
            return reply.send(photos);
        }
        catch (error) {
            console.error('[Scrapbook Error]', error);
            return reply.status(500).send({ error: 'Failed to fetch photos' });
        }
    });
    fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const schema = z.object({
                url: z.string().url(),
                thumbnailUrl: z.string().url().optional(),
                lat: z.number().optional(),
                lng: z.number().optional(),
                caption: z.string().max(500).optional(),
                takenAt: z.string().datetime().optional()
            });
            const data = schema.parse(request.body);
            let user = await prisma.user.findUnique({ where: { username: request.user.username } });
            if (!user) {
                user = await prisma.user.create({
                    data: { username: request.user.username, displayName: request.user.displayName }
                });
            }
            const photo = await prisma.scrapbookPhoto.create({
                data: {
                    ...data,
                    takenAt: data.takenAt ? new Date(data.takenAt) : undefined,
                    uploadedBy: user.id
                }
            });
            return reply.status(201).send(photo);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            console.error('[Scrapbook Error]', error);
            return reply.status(500).send({ error: 'Failed to upload photo' });
        }
    });
    fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            await prisma.scrapbookPhoto.delete({ where: { id: params.id } });
            return reply.status(204).send();
        }
        catch {
            return reply.status(404).send({ error: 'Photo not found' });
        }
    });
}
//# sourceMappingURL=scrapbook.js.map