import { z } from 'zod';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import webPush from 'web-push';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(
    'mailto:admin@rina.app',
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

const subSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string()
});

const notifySchema = z.object({
  title: z.string().max(100).optional(),
  body: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  url: z.string().url().optional()
});

export default async function pushRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post('/subscribe', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const data = subSchema.parse(request.body);

      // Prevent subscription hijacking: check if endpoint already belongs to another user
      const existing = await prisma.pushSubscription.findUnique({
        where: { endpoint: data.endpoint }
      });
      if (existing && existing.userId !== request.user!.id) {
        return reply.status(409).send({ error: 'Endpoint already registered by another user' });
      }

      await prisma.pushSubscription.upsert({
        where: { endpoint: data.endpoint },
        update: { p256dh: data.p256dh, auth: data.auth, userId: request.user!.id },
        create: { ...data, userId: request.user!.id }
      });

      return reply.status(201).send({ message: 'Subscribed' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      return reply.status(500).send({ error: 'Failed to subscribe' });
    }
  });

  fastify.post('/unsubscribe', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      const schema = z.object({ endpoint: z.string().url() });
      const { endpoint } = schema.parse(request.body);
      await prisma.pushSubscription.deleteMany({
        where: { endpoint, userId: request.user!.id }
      });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      return reply.status(500).send({ error: 'Failed to unsubscribe' });
    }
  });

  fastify.post('/notify', { preValidation: [authenticateJWT] }, async (request, reply) => {
    try {
      if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        return reply.status(503).send({ error: 'Push notifications are not configured (VAPID keys missing)' });
      }

      const body = notifySchema.parse(request.body);
      const partnerUsername = request.user!.username === 'maroon' ? 'rina' : 'maroon';
      const partner = await prisma.user.findUnique({
        where: { username: partnerUsername },
        include: { pushSubs: true }
      });

      if (!partner || partner.pushSubs.length === 0) {
        return reply.status(404).send({ error: 'Partner has no push subscriptions' });
      }

      const payload = JSON.stringify({
        title: body.title || 'Rina 💕',
        body: body.body || 'Your partner sent you a message',
        tag: body.tag || 'rina',
        url: body.url || '/'
      });

      const results = await Promise.allSettled(
        partner.pushSubs.map((sub) =>
          webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            payload
          )
        )
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return reply.send({
        message: 'Push notifications sent',
        recipients: partner.pushSubs.length,
        succeeded,
        failed
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors });
      }
      console.error('[Push Error]', error);
      return reply.status(500).send({ error: 'Failed to send notification' });
    }
  });

  fastify.get('/vapid-public', async (_request, reply) => {
    return reply.send({ key: VAPID_PUBLIC });
  });
}
