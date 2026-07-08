import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import type { AddBodyMetricBody, BodyMetric, BodyMetricKind } from "@afya/shared";
import { db } from "../db";
import { bodyMetric } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const KINDS: BodyMetricKind[] = ["weight", "resting_hr", "sleep_hours", "body_fat"];

const toMetric = (r: typeof bodyMetric.$inferSelect): BodyMetric => ({
  id: r.id,
  kind: r.kind,
  value: r.value,
  measuredAt: r.measuredAt.toISOString(),
});

/** List a metric kind over time (oldest first, for trend lines). */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const kind = c.req.query("kind") as BodyMetricKind | undefined;
  const conds = [eq(bodyMetric.userId, userId)];
  if (kind && KINDS.includes(kind)) conds.push(eq(bodyMetric.kind, kind));
  const rows = await db
    .select()
    .from(bodyMetric)
    .where(and(...conds))
    .orderBy(asc(bodyMetric.measuredAt));
  return c.json(rows.map(toMetric));
});

app.post("/", async (c) => {
  const body = await c.req.json<AddBodyMetricBody>().catch(() => null);
  if (!body || !KINDS.includes(body.kind) || typeof body.value !== "number") {
    return c.json({ error: "bad_request", message: "A known kind and numeric value are required." }, 400);
  }
  const [row] = await db
    .insert(bodyMetric)
    .values({
      userId: c.get("userId"),
      kind: body.kind,
      value: body.value,
      measuredAt: body.measuredAt ? new Date(body.measuredAt) : undefined,
    })
    .returning();
  return c.json(toMetric(row!), 201);
});

export default app;
