const cacheName = 'VERSION';
const shell = ['SHELL'];
// The first versions named their caches meal-deck-; later ones talvalogato-.
const earlierCachePrefixes = ['talvalogato-', 'meal-deck-'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== cacheName && earlierCachePrefixes.some(prefix => key.startsWith(prefix))) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// Reads only this version's cache: other caches on the origin may hold an earlier version of the app.
const fromCache = request => caches.open(cacheName).then(cache => cache.match(request));

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => fromCache('/')));
  } else if (shell.includes(url.pathname)) {
    event.respondWith(fromCache(request).then(response => response ?? fetch(request)));
  }
});
