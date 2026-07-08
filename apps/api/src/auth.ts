import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { redis } from "./redis/client";
import { env } from "./env";

/**
 * Better Auth — embedded, open-source auth.
 * - Users/accounts/verification live in Postgres (Drizzle adapter).
 * - Sessions, verification tokens, and the auth rate-limit counters live in
 *   Redis via secondary storage (offloads them from Postgres).
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, { provider: "pg" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // personal app: keep onboarding simple
  },

  // Redis-backed secondary storage. get() tolerates both JSON values (sessions)
  // and plain values (counters); the cache/rate-limit client is shared.
  secondaryStorage: {
    get: async (key) => {
      const value = await redis.get(key);
      if (value === null) return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    },
    set: async (key, value, ttl) => {
      if (ttl) await redis.set(key, value, "EX", ttl);
      else await redis.set(key, value);
    },
    delete: async (key) => {
      await redis.del(key);
    },
  },

  session: {
    storeSessionInDatabase: false, // sessions are pure-Redis
    cookieCache: { enabled: true, maxAge: 60 }, // signed 60s cookie cache
  },

  // CSRF: state-changing requests are validated against this origin allowlist.
  // Kept identical to the CORS allowlist.
  trustedOrigins: env.CORS_ORIGINS,

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "secondary-storage",
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    cookiePrefix: "afya",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
  },
});

export type Auth = typeof auth;
