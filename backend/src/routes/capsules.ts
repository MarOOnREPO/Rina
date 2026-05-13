import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const capsuleSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  encryptedData: z.string().min(1),
  mediaType: z.enum(['audio', 'video', 'text']),
  unlockAt: z.string().datetime()
});

router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username: req.user!.username, displayName: req.user!.displayName }
      });
    }

    const capsules = await prisma.timeCapsule.findMany({
      orderBy: { unlockAt: 'asc' }
    });
    res.json(capsules);
  } catch (error) {
    console.error('[Capsule Error]', error);
    res.status(500).json({ error: 'Failed to fetch capsules' });
  }
});

router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const data = capsuleSchema.parse(req.body);
    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username: req.user!.username, displayName: req.user!.displayName }
      });
    }

    const capsule = await prisma.timeCapsule.create({
      data: {
        ...data,
        creatorId: user.id
      }
    });
    res.status(201).json(capsule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('[Capsule Error]', error);
    res.status(500).json({ error: 'Failed to create capsule' });
  }
});

router.get('/:id/unlock', authenticateJWT, async (req, res) => {
  try {
    const capsule = await prisma.timeCapsule.findUnique({ where: { id: req.params.id } });
    if (!capsule) {
      res.status(404).json({ error: 'Capsule not found' });
      return;
    }

    const now = new Date();
    if (now < capsule.unlockAt) {
      const diff = capsule.unlockAt.getTime() - now.getTime();
      res.status(403).json({
        error: 'Capsule is still locked',
        unlocksIn: diff,
        unlockAt: capsule.unlockAt
      });
      return;
    }

    await prisma.timeCapsule.update({
      where: { id: req.params.id },
      data: { openedAt: now }
    });

    res.json({ data: capsule.encryptedData, decrypted: true });
  } catch (error) {
    console.error('[Capsule Error]', error);
    res.status(500).json({ error: 'Failed to unlock capsule' });
  }
});

router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    await prisma.timeCapsule.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Capsule not found' });
  }
});

export default router;
