import { Hono } from "hono";
import { and, asc, eq, gte } from "drizzle-orm";
import type { AddFuelEntryBody, FuelDay, FuelEntry, NutritionTarget } from "@afya/shared";
import { db } from "../db";
import { fuelEntry, nutritionTarget } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const DEFAULT_TARGET: NutritionTarget = { proteinG: 180, calories: 2600 };

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const toEntry = (r: typeof fuelEntry.$inferSelect): FuelEntry => ({
  id: r.id,
  label: r.label,
  proteinG: r.proteinG,
  calories: r.calories,
  loggedAt: r.loggedAt.toISOString(),
});

async function targetFor(userId: string): Promise<NutritionTarget> {
  const [t] = await db.select().from(nutritionTarget).where(eq(nutritionTarget.userId, userId)).limit(1);
  return t ? { proteinG: t.proteinG, calories: t.calories } : DEFAULT_TARGET;
}

/** Today's fuel: target, entries, and running totals. */
app.get("/today", async (c) => {
  const userId = c.get("userId");
  const target = await targetFor(userId);
  const entries = await db
    .select()
    .from(fuelEntry)
    .where(and(eq(fuelEntry.userId, userId), gte(fuelEntry.loggedAt, startOfDay(new Date()))))
    .orderBy(asc(fuelEntry.loggedAt));
  const totals = entries.reduce(
    (acc, e) => ({ proteinG: acc.proteinG + e.proteinG, calories: acc.calories + e.calories }),
    { proteinG: 0, calories: 0 },
  );
  return c.json({
    date: localDate(new Date()),
    target,
    entries: entries.map(toEntry),
    totals,
  } satisfies FuelDay);
});

app.post("/", async (c) => {
  const body = await c.req.json<AddFuelEntryBody>().catch(() => null);
  const label = body?.label?.trim();
  if (!label) return c.json({ error: "bad_request", message: "A label is required." }, 400);
  const [row] = await db
    .insert(fuelEntry)
    .values({
      userId: c.get("userId"),
      label,
      proteinG: Math.max(0, body?.proteinG ?? 0),
      calories: Math.max(0, Math.round(body?.calories ?? 0)),
    })
    .returning();
  return c.json(toEntry(row!), 201);
});

app.delete("/:id", async (c) => {
  const deleted = await db
    .delete(fuelEntry)
    .where(and(eq(fuelEntry.id, c.req.param("id")), eq(fuelEntry.userId, c.get("userId"))))
    .returning();
  if (!deleted[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

app.put("/target", async (c) => {
  const body = await c.req.json<NutritionTarget>().catch(() => null);
  if (!body || typeof body.proteinG !== "number" || typeof body.calories !== "number") {
    return c.json({ error: "bad_request" }, 400);
  }
  const userId = c.get("userId");
  const values = {
    userId,
    proteinG: Math.max(0, Math.round(body.proteinG)),
    calories: Math.max(0, Math.round(body.calories)),
  };
  await db
    .insert(nutritionTarget)
    .values(values)
    .onConflictDoUpdate({
      target: nutritionTarget.userId,
      set: { proteinG: values.proteinG, calories: values.calories },
    });
  return c.json({ proteinG: values.proteinG, calories: values.calories } satisfies NutritionTarget);
});

/** Daily protein/calorie totals over the last N days — powers the adherence chart. */
app.get("/history", async (c) => {
  const userId = c.get("userId");
  const days = Math.min(60, Math.max(1, Number(c.req.query("days")) || 7));
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - (days - 1));

  const entries = await db
    .select()
    .from(fuelEntry)
    .where(and(eq(fuelEntry.userId, userId), gte(fuelEntry.loggedAt, start)))
    .orderBy(asc(fuelEntry.loggedAt));

  const byDate = new Map<string, { proteinG: number; calories: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    byDate.set(localDate(d), { proteinG: 0, calories: 0 });
  }
  for (const e of entries) {
    const key = localDate(e.loggedAt);
    const bucket = byDate.get(key);
    if (bucket) {
      bucket.proteinG += e.proteinG;
      bucket.calories += e.calories;
    }
  }
  return c.json({
    target: await targetFor(userId),
    days: [...byDate.entries()].map(([date, totals]) => ({ date, ...totals })),
  });
});

export default app;
