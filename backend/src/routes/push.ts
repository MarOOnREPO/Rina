import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
// VAPID_PRIVATE_KEY should be set in env when integrating web-push library

const subSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string()
});

router.post('/subscribe', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const data = subSchema.parse(req.body);
    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username: req.user!.username, displayName: req.user!.displayName }
      });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      update: { p256dh: data.p256dh, auth: data.auth, userId: user.id },
      create: { ...data, userId: user.id }
    });

    res.status(201).json({ message: 'Subscribed' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

router.post('/unsubscribe', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { endpoint } = req.body;
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, user: { username: req.user!.username } }
    });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// Admin endpoint to send push to partner
router.post('/notify', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const partnerUsername = req.user!.username === 'maroon' ? 'rina' : 'maroon';
    const partner = await prisma.user.findUnique({
      where: { username: partnerUsername },
      include: { pushSubs: true }
    });

    if (!partner || partner.pushSubs.length === 0) {
      res.status(404).json({ error: 'Partner has no push subscriptions' });
      return;
    }

    const payload = JSON.stringify({
      title: req.body.title || 'Rina 💕',
      body: req.body.body || 'Your partner sent you a message',
      tag: req.body.tag || 'rina',
      url: req.body.url || '/'
    });

    // web-push would be used here in production with VAPID keys
    // For now, return the subscriptions that would be notified
    res.json({
      message: 'Push notification queued',
      recipients: partner.pushSubs.length,
      payload
    });
  } catch (error) {
    console.error('[Push Error]', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

router.get('/vapid-public', (_req, res) => {
  res.json({ key: VAPID_PUBLIC });
});

export default router;
