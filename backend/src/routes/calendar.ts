import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  type: z.enum(['WORK', 'SHARED']).default('SHARED'),
  allDay: z.boolean().default(false),
  color: z.string().max(7).optional()
});

router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.query;
    const where: Record<string, unknown> = {};

    if (from || to) {
      where.startTime = {};
      if (from) (where.startTime as Record<string, Date>).gte = new Date(from as string);
      if (to) (where.startTime as Record<string, Date>).lte = new Date(to as string);
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: 'asc' }
    });

    res.json(events);
  } catch (error) {
    console.error('[Calendar Error]', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const data = eventSchema.parse(req.body);
    const event = await prisma.calendarEvent.create({
      data: {
        ...data,
        creator: req.user!.username
      }
    });
    res.status(201).json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('[Calendar Error]', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.patch('/:id', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    const event = await prisma.calendarEvent.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(event);
  } catch {
    res.status(404).json({ error: 'Event not found' });
  }
});

router.delete('/:id', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    await prisma.calendarEvent.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Event not found' });
  }
});

export default router;
