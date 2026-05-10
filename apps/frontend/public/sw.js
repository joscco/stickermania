/**
 * Minimal Service Worker that pre-caches the SVG sprite sheet
 * so icons and sticker thumbnails work offline / load instantly.
 *
 * Strategy: Cache-First for the sprite, Network-First for everything else.
 */

const SPRITE_URL = '/assets/sprite.svg';
const CACHE_NAME = 'sprite-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(SPRITE_URL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-first for the sprite
  if (url.pathname === SPRITE_URL) {
    event.respondWith(
      caches.match(SPRITE_URL).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(SPRITE_URL, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Network-first for everything else (no caching)
  event.respondWith(fetch(event.request));
});