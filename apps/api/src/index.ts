import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ApiErrorBody } from "@afya/shared";
import { env } from "./env";
import { auth } from "./auth";
import exercises from "./routes/exercises";
import programs from "./routes/programs";
import sessions from "./routes/sessions";
import fuel from "./routes/fuel";
import metrics from "./routes/metrics";
import trends from "./routes/trends";
import records from "./routes/records";
import { resolveTimeZone } from "./middleware/time-zone";

export const app = new Hono();

// Global safety net: any thrown exception anywhere in the app lands here.
// Registered on `app` itself — because every route, including nested
// sub-routers and the /api/auth/* passthrough, shares this instance's
// router/errorHandler, this alone covers the whole app. It does NOT run
// for handler-returned Responses (e.g. `c.json({error:...}, 400)`) — only
// for thrown Errors, so existing intentional error responses are untouched.
app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();

  // requireAuth only runs inside the /api sub-router, so userId may be unset
  // (e.g. a crash in /api/auth/* or in secureHeaders/cors before any route runs).
  const userId = (c.var as { userId?: string }).userId;
  console.error(
    `[api] unhandled error: ${c.req.method} ${c.req.path}${userId ? ` (user ${userId})` : ""}:`,
    err,
  );

  return c.json(
    { error: "internal_error", message: "Something went wrong. Please try again." } satisfies ApiErrorBody,
    500,
  );
});

// Sensible security headers on every response.
app.use("*", secureHeaders());

// CORS restricted to the configured browser origins; credentials for cookies.
const isPublicOrigin = env.CORS_ORIGINS.length === 1 && env.CORS_ORIGINS[0] === "*";
app.use(
  "/api/*",
  cors({
    origin: isPublicOrigin ? (origin) => origin : env.CORS_ORIGINS,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

// Better Auth owns all /api/auth/* routes (sign-up, sign-in, session, sign-out…).
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Application routes: session-guarded (per-router).
const api = new Hono();
// The caller's calendar zone, resolved once for every application route rather than parsed
// per handler. Auth routes are mounted above and never ask what day it is.
api.use("*", resolveTimeZone);
api.route("/exercises", exercises);
api.route("/programs", programs);
api.route("/sessions", sessions);
api.route("/fuel", fuel);
api.route("/metrics", metrics);
api.route("/trends", trends);
api.route("/records", records);
app.route("/api", api);

if (env.NODE_ENV === "production") {
  // Hashed asset files — browsers can cache these aggressively.
  app.use("/assets/*", serveStatic({ root: "./web-dist" }));
  // SPA fallback — the client router handles all non-API paths.
  app.use("*", serveStatic({ path: "./web-dist/index.html" }));
}

export default app;
