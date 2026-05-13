import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const messageSchema = z.object({
  content: z.string().min(1).max(4000),
  type: z.enum(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO']).default('TEXT'),
  replyToId: z.string().optional()
});

router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const before = req.query.before as string | undefined;

    const messages = await prisma.message.findMany({
      where: before ? { createdAt: { lt: new Date(before) } } : {},
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.json(messages);
  } catch (error) {
    console.error('[Message Error]', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const data = messageSchema.parse(req.body);
    // Find or create user record for foreign key
    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: req.user!.username,
          displayName: req.user!.displayName
        }
      });
    }

    const message = await prisma.message.create({
      data: {
        ...data,
        senderId: user.id
      }
    });
    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('[Message Error]', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
