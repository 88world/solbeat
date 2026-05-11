import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let upstash: Redis | null = null;
if (url && token) {
  upstash = new Redis({ url, token });
}

/**
 * Cache key version prefix. Bump this whenever a structural change to
 * the cached value shape happens — or when a stretch of bad values
 * (e.g. the synthesis-pipeline regression from 33ba203) needs to be
 * orphaned without a destructive FLUSHDB. Old keys remain in Redis
 * until their TTL elapses, then expire on their own; new reads + writes
 * all use the prefixed form and start fresh.
 *
 * Bumped to v2 to invalidate the stale `synthesis: null` cached
 * SlowAnalysis objects from before the Anthropic prompt-caching
 * format revert.
 */
const CACHE_VERSION = "v2:";
const k = (key: string): string => CACHE_VERSION + key;

// In-memory fallback so the app works offline / without Upstash credentials.
type MemEntry = { value: unknown; expires: number };
const mem = new Map<string, MemEntry>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  const full = k(key);
  if (upstash) {
    try {
      const v = await upstash.get<T>(full);
      return v ?? null;
    } catch {
      // fall through to memory
    }
  }
  const e = mem.get(full);
  if (!e) return null;
  if (e.expires < Date.now()) {
    mem.delete(full);
    return null;
  }
  return e.value as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const full = k(key);
  if (upstash) {
    try {
      await upstash.set(full, value, { ex: ttlSeconds });
      return;
    } catch {
      // fall through to memory
    }
  }
  mem.set(full, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null && hit !== undefined) return hit;
  const fresh = await loader();
  // Don't store null/undefined results. We were poisoning the cache when
  // an upstream call failed (e.g., Claude returning null from a 400 on
  // prompt-caching invalid) — that null then served for the full TTL,
  // blocking recovery even after the upstream issue was resolved. Errors
  // should let the next visitor retry, not get cached for hours.
  if (fresh !== null && fresh !== undefined) {
    await cacheSet(key, fresh, ttlSeconds);
  }
  return fresh;
}
