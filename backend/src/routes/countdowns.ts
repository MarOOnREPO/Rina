import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const countdownSchema = z.object({
  title: z.string().min(1).max(200),
  targetDate: z.string().datetime(),
  location: z.string().max(200).optional(),
  imageUrl: z.string().url().optional()
});

router.get('/', authenticateJWT, async (_req, res) => {
  try {
    const countdowns = await prisma.countdown.findMany({
      orderBy: { targetDate: 'asc' }
    });
    res.json(countdowns);
  } catch (error) {
    console.error('[Countdown Error]', error);
    res.status(500).json({ error: 'Failed to fetch countdowns' });
  }
});

router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const data = countdownSchema.parse(req.body);
    const countdown = await prisma.countdown.create({ data });
    res.status(201).json(countdown);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('[Countdown Error]', error);
    res.status(500).json({ error: 'Failed to create countdown' });
  }
});

router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    await prisma.countdown.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Countdown not found' });
  }
});

export default router;
