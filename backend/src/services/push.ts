import webPush from 'web-push';
import { prisma } from './prisma.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(
    'mailto:admin@rina.app',
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; tag?: string; url?: string }
): Promise<{ succeeded: number; failed: number }> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return { succeeded: 0, failed: 0 };
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { succeeded: 0, failed: 0 };

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag || 'rina',
    url: payload.url || '/',
    icon: '/favicon.png',
    badge: '/favicon.png'
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        pushPayload
      )
    )
  );

  // Clean up expired subscriptions
  const expiredEndpoints = subs
    .filter((_, i) => results[i].status === 'rejected')
    .map((s) => s.endpoint);

  if (expiredEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: expiredEndpoints } }
    });
  }

  return {
    succeeded: results.filter((r) => r.status === 'fulfilled').length,
    failed: results.filter((r) => r.status === 'rejected').length
  };
}
