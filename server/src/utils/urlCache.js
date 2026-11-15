/** In-memory cache: `${userId}:${longUrl}` → { link, expiresAt } */
const cache = new Map();

const MAX_ENTRIES = Number(process.env.URL_CACHE_MAX || 5000);
const TTL_MS = Number(process.env.URL_CACHE_TTL_MS || 10 * 60 * 1000);

function cacheKey(userId, longUrl) {
  return `${userId}:${longUrl}`;
}

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function enforceCap() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

export function getCachedLink(userId, longUrl) {
  const entry = cache.get(cacheKey(userId, longUrl));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(cacheKey(userId, longUrl));
    return null;
  }
  return entry.link;
}

export function setCachedLink(userId, longUrl, link) {
  if (cache.size > MAX_ENTRIES * 1.1) evictExpired();
  cache.set(cacheKey(userId, longUrl), {
    link,
    expiresAt: Date.now() + TTL_MS,
  });
  enforceCap();
}

export function deleteCachedLink(userId, longUrl) {
  cache.delete(cacheKey(userId, longUrl));
}

export function clearUrlCache() {
  cache.clear();
}
