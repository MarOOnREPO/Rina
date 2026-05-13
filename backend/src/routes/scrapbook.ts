import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../server.js';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateJWT, async (_req, res) => {
  try {
    const photos = await prisma.scrapbookPhoto.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(photos);
  } catch (error) {
    console.error('[Scrapbook Error]', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res) => {
  try {
    // In production, this would handle multipart upload to S3/MinIO
    // For now, accept URL-based uploads
    const schema = z.object({
      url: z.string().url(),
      thumbnailUrl: z.string().url().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      caption: z.string().max(500).optional(),
      takenAt: z.string().datetime().optional()
    });
    const data = schema.parse(req.body);

    let user = await prisma.user.findUnique({ where: { username: req.user!.username } });
    if (!user) {
      user = await prisma.user.create({
        data: { username: req.user!.username, displayName: req.user!.displayName }
      });
    }

    const photo = await prisma.scrapbookPhoto.create({
      data: {
        ...data,
        takenAt: data.takenAt ? new Date(data.takenAt) : undefined,
        uploadedBy: user.id
      }
    });
    res.status(201).json(photo);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
      return;
    }
    console.error('[Scrapbook Error]', error);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

router.delete('/:id', authenticateJWT, async (req, res) => {
  try {
    await prisma.scrapbookPhoto.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: 'Photo not found' });
  }
});

export default router;
