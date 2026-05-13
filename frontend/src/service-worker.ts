/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = 'rina-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/login',
  '/chat',
  '/calendar',
  '/movies',
  '/video',
  '/whiteboard',
  '/capsules',
  '/map'
];

// Install: cache static assets
sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  sw.skipWaiting();
});

// Activate: clean old caches
sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  sw.clients.claim();
});

// Fetch: network-first strategy for API, cache-first for static
sw.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // API requests: network first
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request) as Promise<Response>;
      })
    );
    return;
  }

  // Static assets: cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      );
    })
  );
});

// Push Notifications
sw.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'Rina 💕';
  const options: NotificationOptions = {
    body: data.body || 'Your partner sent you a message',
    icon: '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag || 'rina-notification',
    requireInteraction: data.requireInteraction ?? false,
    data: data.url || '/'
  };

  event.waitUntil(sw.registration.showNotification(title, options));
});

// Notification click
sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    sw.clients.matchAll({ type: 'window' }).then((clients) => {
      const client = clients.find((c) => c.url === url);
      if (client) {
        client.focus();
      } else {
        sw.clients.openWindow(url);
      }
    })
  );
});
