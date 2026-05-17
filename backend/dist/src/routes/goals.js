import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
const goalSchema = z.object({
    title: z.string().min(1).max(200),
    targetAmount: z.number().int().positive(),
    currentAmount: z.number().int().default(0),
    currency: z.string().default('EUR'),
    deadline: z.string().datetime().optional(),
    icon: z.string().max(50).optional()
});
export default async function goalRoutes(fastify, _opts) {
    fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            let user = await prisma.user.findUnique({ where: { username: request.user.username } });
            if (!user) {
                user = await prisma.user.create({
                    data: { username: request.user.username, displayName: request.user.displayName }
                });
            }
            const goals = await prisma.goal.findMany({
                where: { createdBy: user.id },
                orderBy: { createdAt: 'desc' }
            });
            return reply.send(goals);
        }
        catch (error) {
            console.error('[Goal Error]', error);
            return reply.status(500).send({ error: 'Failed to fetch goals' });
        }
    });
    fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const data = goalSchema.parse(request.body);
            let user = await prisma.user.findUnique({ where: { username: request.user.username } });
            if (!user) {
                user = await prisma.user.create({
                    data: { username: request.user.username, displayName: request.user.displayName }
                });
            }
            const goal = await prisma.goal.create({
                data: { ...data, createdBy: user.id }
            });
            return reply.status(201).send(goal);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            console.error('[Goal Error]', error);
            return reply.status(500).send({ error: 'Failed to create goal' });
        }
    });
    fastify.patch('/:id/contribute', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const schema = z.object({ amount: z.number().int().positive() });
            const { amount } = schema.parse(request.body);
            const params = request.params;
            const goal = await prisma.goal.update({
                where: { id: params.id },
                data: { currentAmount: { increment: amount } }
            });
            return reply.send(goal);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            return reply.status(404).send({ error: 'Goal not found' });
        }
    });
    fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            await prisma.goal.delete({ where: { id: params.id } });
            return reply.status(204).send();
        }
        catch {
            return reply.status(404).send({ error: 'Goal not found' });
        }
    });
}
//# sourceMappingURL=goals.js.map