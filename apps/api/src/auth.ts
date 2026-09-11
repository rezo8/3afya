import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authDb } from "./db";
import { env } from "./env";

/**
 * Better Auth — embedded, open-source auth. The auth tables (including
 * `session`) live in mi7rab's database, which every app in the umbrella shares;
 * 3afya only reads and writes them, it never migrates them.
 *
 * Sessions are in Postgres. A 60s signed cookie cache keeps that off the hot
 * path — most requests verify the cookie and never reach the session table.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(authDb, { provider: "pg" }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // personal app: keep onboarding simple
  },

  session: {
    cookieCache: { enabled: true, maxAge: 60 }, // signed 60s cookie cache
  },

  // CSRF: state-changing requests are validated against this origin allowlist.
  // Kept identical to the CORS allowlist.
  trustedOrigins: env.CORS_ORIGINS,

  // In-memory brute-force guard on /api/auth/* only. Per-instance rather than
  // global, which is the point: it needs no infrastructure, and a login
  // throttle that resets on cold start still beats none.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "memory",
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    cookiePrefix: "mihrab",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
    },
  },
});

export type Auth = typeof auth;
