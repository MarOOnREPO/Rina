import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const subSchema = z.object({
    endpoint: z.string().url(),
    p256dh: z.string(),
    auth: z.string()
});
export default async function pushRoutes(fastify, _opts) {
    fastify.post('/subscribe', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const data = subSchema.parse(request.body);
            let user = await prisma.user.findUnique({ where: { username: request.user.username } });
            if (!user) {
                user = await prisma.user.create({
                    data: { username: request.user.username, displayName: request.user.displayName }
                });
            }
            await prisma.pushSubscription.upsert({
                where: { endpoint: data.endpoint },
                update: { p256dh: data.p256dh, auth: data.auth, userId: user.id },
                create: { ...data, userId: user.id }
            });
            return reply.status(201).send({ message: 'Subscribed' });
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            return reply.status(500).send({ error: 'Failed to subscribe' });
        }
    });
    fastify.post('/unsubscribe', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const { endpoint } = request.body;
            await prisma.pushSubscription.deleteMany({
                where: { endpoint, user: { username: request.user.username } }
            });
            return reply.status(204).send();
        }
        catch {
            return reply.status(500).send({ error: 'Failed to unsubscribe' });
        }
    });
    fastify.post('/notify', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const partnerUsername = request.user.username === 'maroon' ? 'rina' : 'maroon';
            const partner = await prisma.user.findUnique({
                where: { username: partnerUsername },
                include: { pushSubs: true }
            });
            if (!partner || partner.pushSubs.length === 0) {
                return reply.status(404).send({ error: 'Partner has no push subscriptions' });
            }
            const body = request.body;
            const payload = JSON.stringify({
                title: body.title || 'Rina 💕',
                body: body.body || 'Your partner sent you a message',
                tag: body.tag || 'rina',
                url: body.url || '/'
            });
            return reply.send({
                message: 'Push notification queued',
                recipients: partner.pushSubs.length,
                payload
            });
        }
        catch (error) {
            console.error('[Push Error]', error);
            return reply.status(500).send({ error: 'Failed to send notification' });
        }
    });
    fastify.get('/vapid-public', async (_request, reply) => {
        return reply.send({ key: VAPID_PUBLIC });
    });
}
//# sourceMappingURL=push.js.map