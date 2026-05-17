import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
const countdownSchema = z.object({
    title: z.string().min(1).max(200),
    targetDate: z.string().datetime(),
    location: z.string().max(200).optional(),
    imageUrl: z.string().url().optional()
});
export default async function countdownRoutes(fastify, _opts) {
    fastify.get('/', { preValidation: [authenticateJWT] }, async (_request, reply) => {
        try {
            const countdowns = await prisma.countdown.findMany({
                orderBy: { targetDate: 'asc' }
            });
            return reply.send(countdowns);
        }
        catch (error) {
            console.error('[Countdown Error]', error);
            return reply.status(500).send({ error: 'Failed to fetch countdowns' });
        }
    });
    fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const data = countdownSchema.parse(request.body);
            const countdown = await prisma.countdown.create({ data });
            return reply.status(201).send(countdown);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            console.error('[Countdown Error]', error);
            return reply.status(500).send({ error: 'Failed to create countdown' });
        }
    });
    fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            await prisma.countdown.delete({ where: { id: params.id } });
            return reply.status(204).send();
        }
        catch {
            return reply.status(404).send({ error: 'Countdown not found' });
        }
    });
}
//# sourceMappingURL=countdowns.js.map