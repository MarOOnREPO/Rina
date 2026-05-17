import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
const messageSchema = z.object({
    content: z.string().min(1).max(4000),
    type: z.enum(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO']).default('TEXT'),
    replyToId: z.string().optional()
});
export default async function messageRoutes(fastify, _opts) {
    fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const query = request.query;
            const limit = Math.min(parseInt(query.limit || '50', 10), 200);
            const before = query.before;
            const messages = await prisma.message.findMany({
                where: before ? { createdAt: { lt: new Date(before) } } : {},
                orderBy: { createdAt: 'desc' },
                take: limit
            });
            return reply.send(messages);
        }
        catch (error) {
            console.error('[Message Error]', error);
            return reply.status(500).send({ error: 'Failed to fetch messages' });
        }
    });
    fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const data = messageSchema.parse(request.body);
            let user = await prisma.user.findUnique({ where: { username: request.user.username } });
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        username: request.user.username,
                        displayName: request.user.displayName
                    }
                });
            }
            const message = await prisma.message.create({
                data: {
                    ...data,
                    senderId: user.id
                }
            });
            return reply.status(201).send(message);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            console.error('[Message Error]', error);
            return reply.status(500).send({ error: 'Failed to send message' });
        }
    });
}
//# sourceMappingURL=messages.js.map