import { prisma } from './prisma.js';

export interface PartnerInfo {
  id: string;
  username: string;
  displayName: string;
}

const partnerCache = new Map<string, PartnerInfo>();

export async function getPartner(userId: string): Promise<PartnerInfo | null> {
  const cached = partnerCache.get(userId);
  if (cached) return cached;

  const partnership = await prisma.partnership.findFirst({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }]
    },
    include: {
      userA: { select: { id: true, username: true, displayName: true } },
      userB: { select: { id: true, username: true, displayName: true } }
    }
  });

  if (!partnership) return null;

  const partner = partnership.userAId === userId ? partnership.userB : partnership.userA;
  partnerCache.set(userId, partner);
  return partner;
}

export async function ensureDefaultPartnership(): Promise<void> {
  const maroon = await prisma.user.findUnique({ where: { username: 'maroon' } });
  const rina = await prisma.user.findUnique({ where: { username: 'rina' } });

  if (!maroon || !rina) return;

  const existing = await prisma.partnership.findFirst({
    where: {
      OR: [
        { userAId: maroon.id, userBId: rina.id },
        { userAId: rina.id, userBId: maroon.id }
      ]
    }
  });

  if (!existing) {
    await prisma.partnership.create({
      data: { userAId: maroon.id, userBId: rina.id }
    });
    console.log('[Partnership] Created default partnership between maroon and rina');
  }

  // Warm cache
  partnerCache.set(maroon.id, { id: rina.id, username: rina.username, displayName: rina.displayName });
  partnerCache.set(rina.id, { id: maroon.id, username: maroon.username, displayName: maroon.displayName });
}

export function clearPartnerCache(userId?: string): void {
  if (userId) {
    partnerCache.delete(userId);
  } else {
    partnerCache.clear();
  }
}
