/* global self, caches, URL, fetch, Response, Request */
const CACHE_PREFIX = 'financial-ledger-shell-';
const BUILD_ID = new URL(self.location.href).searchParams.get('v') || 'unknown';
const CACHE = `${CACHE_PREFIX}${BUILD_ID}`;
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        SHELL.map(async (path) => {
          const request = new Request(path, { cache: 'reload' });
          const response = await fetch(request);
          if (!response.ok) throw new Error(`Failed to cache ${path}: ${response.status}`);
          await cache.put(path, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/healthz' ||
    event.request.method !== 'GET'
  )
    return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put('/', response.clone());
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error())),
  );
});
