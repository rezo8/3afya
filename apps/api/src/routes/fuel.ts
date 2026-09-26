import { Hono } from "hono";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type {
  AddFuelEntryBody,
  FrequentFuel,
  FuelDay,
  FuelEntry,
  FuelHistory,
  NutritionTarget,
  OptionalGrams,
  PartialTotal,
  UpdateFuelEntryBody,
} from "@afya/shared";
import { localDate, startOfDay, startOfDaysAgo } from "../day";
import { db } from "../db";
import { fuelEntry, nutritionTarget } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const DEFAULT_TARGET: NutritionTarget = { proteinG: 180, calories: 2600, carbsG: null, fatG: null };
const FREQUENT_LIMIT = 8;

const toEntry = (r: typeof fuelEntry.$inferSelect): FuelEntry => ({
  id: r.id,
  label: r.label,
  proteinG: r.proteinG,
  calories: r.calories,
  carbsG: r.carbsG,
  fatG: r.fatG,
  loggedAt: r.loggedAt.toISOString(),
});

/** The current target is the newest row of the append-only log. */
async function targetFor(userId: string): Promise<NutritionTarget> {
  const [current] = await db
    .select({
      proteinG: nutritionTarget.proteinG,
      calories: nutritionTarget.calories,
      carbsG: nutritionTarget.carbsG,
      fatG: nutritionTarget.fatG,
    })
    .from(nutritionTarget)
    .where(eq(nutritionTarget.userId, userId))
    .orderBy(desc(nutritionTarget.createdAt))
    .limit(1);
  return current ?? DEFAULT_TARGET;
}

/** The column's value from the group's newest entry — a fresh portion beats an average of stale ones. */
const newestInGroup = <T>(column: PgColumn) =>
  sql<T>`(array_agg(${column} order by ${fuelEntry.loggedAt} desc))[1]`;

/**
 * The labels this user logs most often, for one-tap re-adding. Derived strictly
 * from their own entries — no food catalog and no fuzzy matching, just an
 * exact match on the trimmed, lowercased label.
 */
async function frequentFor(userId: string): Promise<FrequentFuel[]> {
  return db
    .select({
      label: newestInGroup<string>(fuelEntry.label),
      proteinG: newestInGroup<number>(fuelEntry.proteinG),
      calories: newestInGroup<number>(fuelEntry.calories),
      carbsG: newestInGroup<OptionalGrams>(fuelEntry.carbsG),
      fatG: newestInGroup<OptionalGrams>(fuelEntry.fatG),
    })
    .from(fuelEntry)
    .where(eq(fuelEntry.userId, userId))
    .groupBy(sql`lower(trim(${fuelEntry.label}))`)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${fuelEntry.loggedAt})`))
    .limit(FREQUENT_LIMIT);
}

/** Today's fuel: target, entries, running totals, and the user's frequent labels. */
app.get("/today", async (c) => {
  const zone = c.get("timeZone");
  const userId = c.get("userId");
  const target = await targetFor(userId);
  const entries = await db
    .select()
    .from(fuelEntry)
    .where(and(eq(fuelEntry.userId, userId), gte(fuelEntry.loggedAt, startOfDay(new Date(), zone))))
    .orderBy(asc(fuelEntry.loggedAt));
  const totals = {
    proteinG: entries.reduce((sum, e) => sum + e.proteinG, 0),
    calories: entries.reduce((sum, e) => sum + e.calories, 0),
    carbs: partialTotal(entries.map((e) => e.carbsG)),
    fat: partialTotal(entries.map((e) => e.fatG)),
  };
  return c.json({
    date: localDate(new Date(), zone),
    target,
    entries: entries.map(toEntry),
    totals,
    frequent: await frequentFor(userId),
  } satisfies FuelDay);
});

/** Sums what was given and counts what was not, so a total never passes off missing grams as zero. */
const partialTotal = (values: OptionalGrams[]): PartialTotal => ({
  grams: values.reduce<number>((sum, v) => sum + (v ?? 0), 0),
  entriesWithout: values.filter((v) => v === null).length,
});

/** A number the caller gave, clamped at zero, or null when they gave none. */
const optionalGrams = (value: unknown): OptionalGrams =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;

/** The editable fields of an entry, read the same way whether it is being logged or corrected. */
function readFuelFields(body: AddFuelEntryBody | null) {
  const label = body?.label?.trim();
  if (!label) return null;
  return {
    label,
    proteinG: Math.max(0, body?.proteinG ?? 0),
    calories: Math.max(0, Math.round(body?.calories ?? 0)),
    carbsG: optionalGrams(body?.carbsG),
    fatG: optionalGrams(body?.fatG),
  };
}

app.post("/", async (c) => {
  const fields = readFuelFields(await c.req.json<AddFuelEntryBody>().catch(() => null));
  if (!fields) return c.json({ error: "bad_request", message: "A label is required." }, 400);
  const [row] = await db
    .insert(fuelEntry)
    .values({ userId: c.get("userId"), ...fields })
    .returning();
  return c.json(toEntry(row!), 201);
});

app.patch("/:id", async (c) => {
  const fields = readFuelFields(await c.req.json<UpdateFuelEntryBody>().catch(() => null));
  if (!fields) return c.json({ error: "bad_request", message: "A label is required." }, 400);
  const [row] = await db
    .update(fuelEntry)
    .set(fields)
    .where(and(eq(fuelEntry.id, c.req.param("id")), eq(fuelEntry.userId, c.get("userId"))))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(toEntry(row));
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
  const carbsG = optionalGrams(body.carbsG);
  const fatG = optionalGrams(body.fatG);
  const target: NutritionTarget = {
    proteinG: Math.max(0, Math.round(body.proteinG)),
    calories: Math.max(0, Math.round(body.calories)),
    // A target is whole grams; a missing one is "no target", not 0 g.
    carbsG: carbsG === null ? null : Math.round(carbsG),
    fatG: fatG === null ? null : Math.round(fatG),
  };
  // Append-only: an edit adds a row rather than overwriting one, so the target
  // each past day was actually judged against stays on record.
  await db.insert(nutritionTarget).values({ userId: c.get("userId"), ...target });
  return c.json(target);
});

/** Daily protein/calorie totals over the last N days — powers the adherence chart. */
app.get("/history", async (c) => {
  const userId = c.get("userId");
  const days = Math.min(60, Math.max(1, Number(c.req.query("days")) || 7));
  const zone = c.get("timeZone");
  const start = startOfDaysAgo(days - 1, zone);

  const entries = await db
    .select()
    .from(fuelEntry)
    .where(and(eq(fuelEntry.userId, userId), gte(fuelEntry.loggedAt, start)))
    .orderBy(asc(fuelEntry.loggedAt));

  const byDate = new Map<string, { proteinG: number; calories: number; entryCount: number }>();
  for (let i = days - 1; i >= 0; i--) {
    byDate.set(localDate(startOfDaysAgo(i, zone), zone), { proteinG: 0, calories: 0, entryCount: 0 });
  }
  for (const e of entries) {
    const key = localDate(e.loggedAt, zone);
    const bucket = byDate.get(key);
    if (bucket) {
      bucket.proteinG += e.proteinG;
      bucket.calories += e.calories;
      bucket.entryCount += 1;
    }
  }
  return c.json({
    target: await targetFor(userId),
    days: [...byDate.entries()].map(([date, day]) => ({ date, ...day })),
  } satisfies FuelHistory);
});

export default app;
