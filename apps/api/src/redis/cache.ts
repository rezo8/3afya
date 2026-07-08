import { redis } from "./client";

/**
 * Cache-aside: return the cached JSON for `key`, else run `load`, cache it, and
 * return it. Redis failures degrade gracefully to `load()` — the cache is an
 * optimization, never a hard dependency, so the screen renders even if Redis is
 * down.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch (err) {
    console.error("[cache] read failed, falling back to source:", (err as Error).message);
  }

  const fresh = await load();

  try {
    await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  } catch (err) {
    console.error("[cache] write failed:", (err as Error).message);
  }

  return fresh;
}
