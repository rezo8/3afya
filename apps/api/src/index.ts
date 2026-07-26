import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "./env";
import { auth } from "./auth";
import { rateLimit } from "./middleware/rate-limit";
import exercises from "./routes/exercises";
import programs from "./routes/programs";
import sessions from "./routes/sessions";
import fuel from "./routes/fuel";
import metrics from "./routes/metrics";
import trends from "./routes/trends";
import records from "./routes/records";

export const app = new Hono();

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
// It has its own rate limiter, so it sits outside our application limiter.
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Application routes: session-guarded (per-router) and rate-limited (here).
const api = new Hono();
api.use("*", rateLimit());
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
