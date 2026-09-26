import { Hono } from "hono";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type {
  AddFuelEntryBody,
  FuelDay,
  FuelEntry,
  FuelHistory,
  NutritionTarget,
  OptionalGrams,
  PartialTotal,
  TargetPeriod,
  UpdateFuelEntryBody,
} from "@afya/shared";
import { localDate, nextLocalDate, parseLocalDate, startOfDaysAgo, startOfLocalDate } from "../day";
import { db } from "../db";
import { fuelEntry, fuelItem, nutritionTarget } from "../db/schema/tracker";
import { isFuelDate, readLoggedAt } from "../fuel-window";
import { optionalGrams, quickAddsFor } from "../fuel-queries";
import { targetInForce, targetPeriods } from "../fuel-targets";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const DEFAULT_TARGET: NutritionTarget = { proteinG: 180, calories: 2600, carbsG: null, fatG: null };

const toEntry = (r: typeof fuelEntry.$inferSelect): FuelEntry => ({
  id: r.id,
  label: r.label,
  proteinG: r.proteinG,
  calories: r.calories,
  carbsG: r.carbsG,
  fatG: r.fatG,
  portion: r.portion,
  itemId: r.itemId,
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

/**
 * One calendar day's fuel in the user's zone: target, entries, totals, and the user's
 * frequent labels. The day is YYYY-MM-DD and must sit inside the back-dating window.
 */
app.get("/day/:date", async (c) => {
  const zone = c.get("timeZone");
  const userId = c.get("userId");
  const date = parseLocalDate(c.req.param("date"));
  if (!date || !isFuelDate(date, new Date(), zone)) {
    return c.json({ error: "bad_request", message: "That day is outside the range fuel can be logged for." }, 400);
  }
  const target = await targetFor(userId);
  const entries = await db
    .select()
    .from(fuelEntry)
    .where(
      and(
        eq(fuelEntry.userId, userId),
        gte(fuelEntry.loggedAt, startOfLocalDate(date, zone)),
        lt(fuelEntry.loggedAt, startOfLocalDate(nextLocalDate(date), zone)),
      ),
    )
    .orderBy(asc(fuelEntry.loggedAt));
  const totals = {
    proteinG: entries.reduce((sum, e) => sum + e.proteinG, 0),
    calories: entries.reduce((sum, e) => sum + e.calories, 0),
    carbs: partialTotal(entries.map((e) => e.carbsG)),
    fat: partialTotal(entries.map((e) => e.fatG)),
  };
  return c.json({
    date,
    target,
    entries: entries.map(toEntry),
    totals,
    quickAdds: await quickAddsFor(userId),
  } satisfies FuelDay);
});

/** Sums what was given and counts what was not, so a total never passes off missing grams as zero. */
const partialTotal = (values: OptionalGrams[]): PartialTotal => ({
  grams: values.reduce<number>((sum, v) => sum + (v ?? 0), 0),
  entriesWithout: values.filter((v) => v === null).length,
});

/** Servings of a quick-add. Anything else — zero, negative, absurd — is not a portion of anything. */
const MAX_PORTION = 20;
const readPortion = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_PORTION ? value : null;

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
    portion: readPortion(body?.portion),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The saved food an entry names, if it is the caller's; "unknown" when it names one that isn't. */
async function ownedItemId(userId: string, value: unknown): Promise<string | null | "unknown"> {
  if (value === undefined || value === null) return null;
  // Checked before the query: Postgres rejects a malformed uuid with an error, not a miss.
  if (typeof value !== "string" || !UUID.test(value)) return "unknown";
  const [row] = await db
    .select({ id: fuelItem.id })
    .from(fuelItem)
    .where(and(eq(fuelItem.id, value), eq(fuelItem.userId, userId)))
    .limit(1);
  return row?.id ?? "unknown";
}

app.post("/", async (c) => {
  const body = await c.req.json<AddFuelEntryBody>().catch(() => null);
  const fields = readFuelFields(body);
  if (!fields) return c.json({ error: "bad_request", message: "A label is required." }, 400);
  const loggedAt = readLoggedAt(body?.loggedAt, new Date(), c.get("timeZone"));
  if (loggedAt.kind === "refused") return c.json({ error: "bad_request", message: loggedAt.message }, 400);
  const itemId = await ownedItemId(c.get("userId"), body?.itemId);
  if (itemId === "unknown") return c.json({ error: "bad_request", message: "Unknown saved food." }, 400);
  const [row] = await db
    .insert(fuelEntry)
    .values({
      userId: c.get("userId"),
      ...fields,
      itemId,
      ...(loggedAt.kind === "at" && { loggedAt: loggedAt.instant }),
    })
    .returning();
  return c.json(toEntry(row!), 201);
});

app.patch("/:id", async (c) => {
  const body = await c.req.json<UpdateFuelEntryBody>().catch(() => null);
  const fields = readFuelFields(body);
  if (!fields) return c.json({ error: "bad_request", message: "A label is required." }, 400);
  // An edit that names no time keeps the one on record rather than moving the entry to now.
  const loggedAt = body?.loggedAt === undefined ? null : readLoggedAt(body.loggedAt, new Date(), c.get("timeZone"));
  if (loggedAt?.kind === "refused") return c.json({ error: "bad_request", message: loggedAt.message }, 400);
  const [row] = await db
    .update(fuelEntry)
    .set({ ...fields, ...(loggedAt?.kind === "at" && { loggedAt: loggedAt.instant }) })
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

/** Every target the user has had, as periods newest first. Nothing is ever overwritten, so this is complete. */
app.get("/targets", async (c) => {
  const rows = await db
    .select({
      proteinG: nutritionTarget.proteinG,
      calories: nutritionTarget.calories,
      carbsG: nutritionTarget.carbsG,
      fatG: nutritionTarget.fatG,
      createdAt: nutritionTarget.createdAt,
    })
    .from(nutritionTarget)
    .where(eq(nutritionTarget.userId, c.get("userId")));
  return c.json(targetPeriods(rows, c.get("timeZone")) satisfies TargetPeriod[]);
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

  const current = await targetFor(userId);
  const targets = await db
    .select({
      proteinG: nutritionTarget.proteinG,
      calories: nutritionTarget.calories,
      carbsG: nutritionTarget.carbsG,
      fatG: nutritionTarget.fatG,
      createdAt: nutritionTarget.createdAt,
    })
    .from(nutritionTarget)
    .where(eq(nutritionTarget.userId, userId));

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
    target: current,
    days: [...byDate.entries()].map(([date, day]) => ({
      date,
      ...day,
      // Before the first target was ever set, the default was what the day was measured against.
      target: targetInForce(targets, startOfLocalDate(nextLocalDate(date), zone), DEFAULT_TARGET),
    })),
  } satisfies FuelHistory);
});

export default app;
