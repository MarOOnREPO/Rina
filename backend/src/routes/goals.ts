import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const goalSchema = z.object({
  title: z.string().min(1).max(200),
  targetAmount: z.number().int().positive(),
  currentAmount: z.number().int().default(0),
  currency: z.string().default('EUR'),
  deadline: z.string().datetime().optional(),
  icon: z.string().max(50).optional()
});

router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username: req.user!.username, displayName: req.user!.displayName }
      });
    }

    const goals = await prisma.goal.findMany({
      where: { createdBy: user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(goals);
  } catch (error) {
    console.error('[Goal Error]', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const data = goalSchema.parse(req.body);
    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username: req.user!.username, displayName: req.user!.displayName }
      });
    }

    const goal = await prisma.goal.create({
      data: { ...data, createdBy: user.id }
    });
    res.status(201).json(goal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('[Goal Error]', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

router.patch('/:id/contribute', authenticateJWT, async (req, res) => {
  try {
    const schema = z.object({ amount: z.number().int().positive() });
    const { amount } = schema.parse(req.body);

    const goal = await prisma.goal.update({
      where: { id: req.params.id },
      data: { currentAmount: { increment: amount } }
    });
    res.json(goal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    res.status(404).json({ error: 'Goal not found' });
  }
});

router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    await prisma.goal.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Goal not found' });
  }
});

export default router;
