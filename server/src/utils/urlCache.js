/** In-memory cache: `${userId}:${longUrl}` → link row */
const cache = new Map();

function cacheKey(userId, longUrl) {
  return `${userId}:${longUrl}`;
}

export function getCachedLink(userId, longUrl) {
  return cache.get(cacheKey(userId, longUrl)) ?? null;
}

export function setCachedLink(userId, longUrl, link) {
  cache.set(cacheKey(userId, longUrl), link);
}

export function clearUrlCache() {
  cache.clear();
}
