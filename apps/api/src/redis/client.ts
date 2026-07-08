import { Redis } from "ioredis";
import { env } from "../env";

/**
 * Shared Redis client: Better Auth session storage, caching, and rate limiting
 * all use this one connection. `commandTimeout` keeps a slow/dead Redis from
 * hanging requests — callers (cache, rate-limit) degrade gracefully.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  commandTimeout: 2000,
  // Connect on first use, not at import — keeps one-shot scripts (e.g. the
  // Better Auth schema-gen CLI) from hanging on an idle open socket.
  lazyConnect: true,
  // rediss:// (managed Redis) requires explicit TLS
  ...(env.REDIS_URL.startsWith("rediss://") && { tls: {} }),
});

redis.on("error", (err) => {
  console.error("[redis]", err.message);
});
