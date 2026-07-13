const ASSET_CACHE_NAME = "stickermania-assets-v1";

type CachedAssetUrlEntry = {
  promise: Promise<string>;
  objectUrl: string | null;
};

export type AssetCacheDescriptor = {
  cacheKey: string;
  requestUrl: string;
};

export type AssetUrlCacheEnvironment = {
  origin: string;
  hostname: string;
  baseUrl: string;
};

export type AssetPreloadOptions = {
  batchSize?: number;
};

const objectUrlCache = new Map<string, CachedAssetUrlEntry>();
const DEFAULT_PRELOAD_BATCH_SIZE = 6;

export function cachedAssetUrl(url: string): Promise<string> {
  const descriptor = assetCacheDescriptor(url);
  if (!descriptor || typeof window === "undefined") {
    return Promise.resolve(resolveBrowserAssetUrl(url));
  }

  const cached = objectUrlCache.get(descriptor.cacheKey);
  if (cached) return cached.promise;

  const entry: CachedAssetUrlEntry = {
    objectUrl: null,
    promise: loadCachedAssetUrl(descriptor)
      .then((loaded) => {
        if (objectUrlCache.get(descriptor.cacheKey) !== entry) {
          revokeObjectUrl(loaded.objectUrl);
          return loaded.objectUrl ? descriptor.requestUrl : loaded.url;
        }
        entry.objectUrl = loaded.objectUrl;
        return loaded.url;
      })
      .catch(() => resolveBrowserAssetUrl(url)),
  };
  objectUrlCache.set(descriptor.cacheKey, entry);
  return entry.promise;
}

export function resolveBrowserAssetUrl(
  url: string,
  environment: AssetUrlCacheEnvironment | null = browserAssetUrlCacheEnvironment(),
): string {
  if (!url || !environment) return url;
  if (url.startsWith("/assets/")) {
    return new URL(url.slice(1), environment.baseUrl).href;
  }
  if (url.startsWith("assets/")) {
    return new URL(url, environment.baseUrl).href;
  }
  return url;
}

export function preloadAssetUrls(urls: Iterable<string | null | undefined>, options?: AssetPreloadOptions): void {
  void preloadAssetUrlsInBatches(urls, options);
}

export async function preloadAssetUrlsInBatches(
  urls: Iterable<string | null | undefined>,
  options: AssetPreloadOptions = {},
): Promise<void> {
  const preloadUrls = await uncachedPreloadUrls(urls).catch(() => uniqueCacheableUrls(urls).map(candidate => candidate.url));
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_PRELOAD_BATCH_SIZE));

  for (let index = 0; index < preloadUrls.length; index += batchSize) {
    const batch = preloadUrls.slice(index, index + batchSize);
    await Promise.all(batch.map(url => cachedAssetUrl(url)));
  }
}

export function clearCachedAssetUrls(): void {
  for (const entry of objectUrlCache.values()) {
    revokeObjectUrl(entry.objectUrl);
  }
  objectUrlCache.clear();
}

export function assetCacheDescriptor(
  url: string,
  environment: AssetUrlCacheEnvironment | null = browserAssetUrlCacheEnvironment(),
): AssetCacheDescriptor | null {
  if (!url || url.startsWith("sprite:#") || url.startsWith("data:") || url.startsWith("blob:")) return null;
  if (!environment) return null;

  const parsed = parseAssetUrl(resolveBrowserAssetUrl(url, environment), environment.origin);
  if (!parsed) return null;
  if (!isCacheableAssetPath(parsed.pathname)) return null;

  const canonicalPath = `${parsed.pathname}${parsed.search}`;
  const cacheKey = `${environment.origin}${canonicalPath}`;
  const requestUrl = shouldUseSameOriginRequest(parsed, environment)
    ? cacheKey
    : parsed.href;

  return {cacheKey, requestUrl};
}

function browserAssetUrlCacheEnvironment(): AssetUrlCacheEnvironment | null {
  if (typeof window === "undefined") return null;
  return {
    origin: window.location.origin,
    hostname: window.location.hostname,
    baseUrl: document.baseURI || `${window.location.origin}/`,
  };
}

function parseAssetUrl(url: string, origin: string): URL | null {
  try {
    return new URL(url, origin);
  } catch {
    return null;
  }
}

export function isCacheableAssetPath(pathname: string): boolean {
  return pathname.startsWith("/api/assets/")
    || /(?:^|\/)assets\/default-stickers\//.test(pathname)
    || /(?:^|\/)assets\/png\//.test(pathname)
    || /(?:^|\/)assets\/svg\//.test(pathname);
}

function shouldUseSameOriginRequest(url: URL, environment: AssetUrlCacheEnvironment): boolean {
  if (url.origin === environment.origin) return true;

  // In local dev the backend may surface absolute localhost URLs while Angular
  // serves the app on another port. The dev proxy can serve the same path from
  // the frontend origin, which gives us one stable cache key and avoids repeats.
  const currentHost = environment.hostname;
  const assetHost = url.hostname;
  return isLocalHost(currentHost) && isLocalHost(assetHost);
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}

type LoadedAssetUrl = {
  url: string;
  objectUrl: string | null;
};

async function loadCachedAssetUrl(descriptor: AssetCacheDescriptor): Promise<LoadedAssetUrl> {
  const cacheRequest = new Request(descriptor.cacheKey, {credentials: "same-origin"});
  const fetchRequest = new Request(descriptor.requestUrl, {credentials: "same-origin"});

  if ("caches" in window) {
    const cache = await caches.open(ASSET_CACHE_NAME);
    const cached = await cache.match(cacheRequest);
    if (cached?.ok) {
      return objectUrlFromBlob(await cached.blob());
    }

    const response = await fetch(fetchRequest);
    if (!response.ok) return {url: descriptor.requestUrl, objectUrl: null};
    await cache.put(cacheRequest, response.clone());
    return objectUrlFromBlob(await response.blob());
  }

  const response = await fetch(fetchRequest);
  if (!response.ok) return {url: descriptor.requestUrl, objectUrl: null};
  return objectUrlFromBlob(await response.blob());
}

async function uncachedPreloadUrls(urls: Iterable<string | null | undefined>): Promise<string[]> {
  const candidates = uniqueCacheableUrls(urls);
  if (typeof window === "undefined" || !("caches" in window)) {
    return candidates.map(candidate => candidate.url);
  }

  const cache = await caches.open(ASSET_CACHE_NAME);
  const result: string[] = [];
  for (const candidate of candidates) {
    if (objectUrlCache.has(candidate.descriptor.cacheKey)) continue;
    const cached = await cache.match(new Request(candidate.descriptor.cacheKey, {credentials: "same-origin"}));
    if (!cached?.ok) {
      result.push(candidate.url);
    }
  }
  return result;
}

function uniqueCacheableUrls(urls: Iterable<string | null | undefined>): Array<{url: string; descriptor: AssetCacheDescriptor}> {
  const seen = new Set<string>();
  const result: Array<{url: string; descriptor: AssetCacheDescriptor}> = [];
  for (const url of urls) {
    if (!url) continue;
    const descriptor = assetCacheDescriptor(url);
    const key = descriptor?.cacheKey ?? url;
    if (!descriptor || seen.has(key)) continue;
    seen.add(key);
    result.push({url, descriptor});
  }
  return result;
}

function objectUrlFromBlob(blob: Blob): LoadedAssetUrl {
  const objectUrl = URL.createObjectURL(blob);
  return {url: objectUrl, objectUrl};
}

function revokeObjectUrl(objectUrl: string | null): void {
  if (objectUrl && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
}
