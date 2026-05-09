import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let upstash: Redis | null = null;
if (url && token) {
  upstash = new Redis({ url, token });
}

// In-memory fallback so the app works offline / without Upstash credentials.
type MemEntry = { value: unknown; expires: number };
const mem = new Map<string, MemEntry>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (upstash) {
    try {
      const v = await upstash.get<T>(key);
      return v ?? null;
    } catch {
      // fall through to memory
    }
  }
  const e = mem.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value as T;
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (upstash) {
    try {
      await upstash.set(key, value, { ex: ttlSeconds });
      return;
    } catch {
      // fall through to memory
    }
  }
  mem.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null && hit !== undefined) return hit;
  const fresh = await loader();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}
