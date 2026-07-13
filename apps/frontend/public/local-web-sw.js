const CACHE_NAME = "stickermania-local-web-v1";
const APP_SHELL_URLS = [
  "./",
  "index.html",
  "assets/sprite-manifest.json",
  "assets/sprite.svg",
  "assets/svg/logo.svg",
  "assets/svg/board-dot-pattern.svg",
  "assets/DarumadropOne-Regular.ttf"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./"));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

function isCacheableAsset(url) {
  return url.pathname === "/index.html"
    || url.pathname.endsWith(".js")
    || url.pathname.endsWith(".css")
    || url.pathname.endsWith(".svg")
    || url.pathname.endsWith(".png")
    || url.pathname.endsWith(".jpg")
    || url.pathname.endsWith(".jpeg")
    || url.pathname.endsWith(".webp")
    || url.pathname.endsWith(".json")
    || url.pathname.endsWith(".ttf")
    || url.pathname.endsWith(".woff")
    || url.pathname.endsWith(".woff2");
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return await cache.match(request)
      || await cache.match(fallbackUrl)
      || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetched = fetch(request)
    .then(response => {
      if (response.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || await fetched || Response.error();
}
