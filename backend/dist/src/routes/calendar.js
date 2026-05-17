import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { authenticateJWT } from '../middleware/auth.js';
const eventSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime().optional(),
    type: z.enum(['WORK', 'SHARED']).default('SHARED'),
    allDay: z.boolean().default(false),
    color: z.string().max(7).optional()
});
export default async function calendarRoutes(fastify, _opts) {
    fastify.get('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const query = request.query;
            const { from, to } = query;
            const where = {};
            if (from || to) {
                where.startTime = {};
                if (from)
                    where.startTime.gte = new Date(from);
                if (to)
                    where.startTime.lte = new Date(to);
            }
            const events = await prisma.calendarEvent.findMany({
                where,
                orderBy: { startTime: 'asc' }
            });
            return reply.send(events);
        }
        catch (error) {
            console.error('[Calendar Error]', error);
            return reply.status(500).send({ error: 'Failed to fetch events' });
        }
    });
    fastify.post('/', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const data = eventSchema.parse(request.body);
            const event = await prisma.calendarEvent.create({
                data: {
                    ...data,
                    creator: request.user.username
                }
            });
            return reply.status(201).send(event);
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                return reply.status(400).send({ error: error.errors });
            }
            console.error('[Calendar Error]', error);
            return reply.status(500).send({ error: 'Failed to create event' });
        }
    });
    fastify.patch('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            const event = await prisma.calendarEvent.update({
                where: { id: params.id },
                data: request.body
            });
            return reply.send(event);
        }
        catch {
            return reply.status(404).send({ error: 'Event not found' });
        }
    });
    fastify.delete('/:id', { preValidation: [authenticateJWT] }, async (request, reply) => {
        try {
            const params = request.params;
            await prisma.calendarEvent.delete({ where: { id: params.id } });
            return reply.status(204).send();
        }
        catch {
            return reply.status(404).send({ error: 'Event not found' });
        }
    });
}
//# sourceMappingURL=calendar.js.map