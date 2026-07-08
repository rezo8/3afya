import type { MiddlewareHandler } from "hono";
import type { ApiErrorBody } from "@afya/shared";
import { redis } from "../redis/client";

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE), keyed by client IP
 * and path. Fails OPEN: if Redis is unavailable the request is allowed through,
 * so a cache/limiter outage never takes the app down. (Better Auth's own limiter
 * covers /api/auth/*; this guards our application routes.)
 */
export function rateLimit(limit = 120, windowSeconds = 60): MiddlewareHandler {
  return async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "anon";
    const key = `rl:${ip}:${c.req.path}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSeconds);

      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", String(Math.max(0, limit - count)));

      if (count > limit) {
        return c.json(
          {
            error: "rate_limited",
            message: "Too many requests — slow down a moment.",
          } satisfies ApiErrorBody,
          429,
        );
      }
    } catch (err) {
      console.error("[rate-limit] redis unavailable, allowing request:", (err as Error).message);
    }

    return next();
  };
}
