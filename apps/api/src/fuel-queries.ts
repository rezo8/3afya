import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { FrequentFuel, FuelItem, OptionalGrams, QuickAddFood } from "@afya/shared";
import { db } from "./db";
import { fuelEntry, fuelItem } from "./db/schema/tracker";

/** How many chips the quick-add row offers. */
const QUICK_ADD_LIMIT = 8;

/** A number the caller gave, clamped at zero, or null when they gave none. */
export const optionalGrams = (value: unknown): OptionalGrams =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;

/** A typed label is the same food as a saved one when they match after trimming and lowercasing. */
export const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * One serving's worth of a column, from the group's newest entry — a fresh portion beats an
 * average of stale ones. Divided by the entry's portion, so logging a quick-add at ×0.5 or ×2
 * doesn't turn the chip into half or double a serving next time.
 */
const newestServing = <T>(column: PgColumn) =>
  sql<T>`(array_agg(${column} / coalesce(${fuelEntry.portion}, 1) order by ${fuelEntry.loggedAt} desc))[1]`;

/**
 * The labels this user types most often, for one-tap re-adding. Derived strictly from their
 * own hand-typed entries — no food catalog and no fuzzy matching, just an exact match on the
 * trimmed, lowercased label. Entries logged from a saved food are left out: that food is the
 * chip for them, under whatever name it has now.
 */
export async function frequentFor(userId: string, limit: number): Promise<FrequentFuel[]> {
  return db
    .select({
      label: sql<string>`(array_agg(${fuelEntry.label} order by ${fuelEntry.loggedAt} desc))[1]`,
      proteinG: newestServing<number>(fuelEntry.proteinG),
      // Calories are whole numbers everywhere else; a divided serving is rounded back to one.
      calories: sql<number>`round((array_agg(${fuelEntry.calories} / coalesce(${fuelEntry.portion}, 1) order by ${fuelEntry.loggedAt} desc))[1])::int`,
      carbsG: newestServing<OptionalGrams>(fuelEntry.carbsG),
      fatG: newestServing<OptionalGrams>(fuelEntry.fatG),
    })
    .from(fuelEntry)
    .where(and(eq(fuelEntry.userId, userId), isNull(fuelEntry.itemId)))
    .groupBy(sql`lower(trim(${fuelEntry.label}))`)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${fuelEntry.loggedAt})`))
    .limit(limit);
}

type ItemRow = typeof fuelItem.$inferSelect;

export const toItem = (r: ItemRow, timesLogged: number): FuelItem => ({
  id: r.id,
  label: r.label,
  unit: r.unit,
  proteinG: r.proteinG,
  calories: r.calories,
  carbsG: r.carbsG,
  fatG: r.fatG,
  timesLogged,
});

/** The user's active saved foods, most logged first, each with its use count. */
export async function itemsFor(userId: string): Promise<FuelItem[]> {
  const rows = await db
    .select({ item: fuelItem, timesLogged: count(fuelEntry.id) })
    .from(fuelItem)
    .leftJoin(fuelEntry, eq(fuelEntry.itemId, fuelItem.id))
    .where(and(eq(fuelItem.userId, userId), isNull(fuelItem.archivedAt)))
    .groupBy(fuelItem.id)
    .orderBy(desc(count(fuelEntry.id)), desc(sql`max(${fuelEntry.loggedAt})`), asc(fuelItem.label));
  return rows.map((r) => toItem(r.item, r.timesLogged));
}

/** Frequent labels that no saved food already answers to. */
export async function unsavedFrequentFor(userId: string, items: FuelItem[], limit: number): Promise<FrequentFuel[]> {
  // Over-fetch by the number of saved foods: each can hide at most one frequent label.
  const frequent = await frequentFor(userId, limit + items.length);
  return frequent.filter((f) => !items.some((i) => sameLabel(i.label, f.label))).slice(0, limit);
}

/** The chip row: saved foods by use, then frequently typed labels not yet saved, up to the limit. */
export async function quickAddsFor(userId: string): Promise<QuickAddFood[]> {
  const items = await itemsFor(userId);
  const saved: QuickAddFood[] = items.slice(0, QUICK_ADD_LIMIT).map((i) => ({
    source: "item",
    itemId: i.id,
    label: i.label,
    unit: i.unit,
    proteinG: i.proteinG,
    calories: i.calories,
    carbsG: i.carbsG,
    fatG: i.fatG,
  }));
  const room = QUICK_ADD_LIMIT - saved.length;
  const typed: QuickAddFood[] =
    room > 0 ? (await unsavedFrequentFor(userId, items, room)).map((f) => ({ source: "frequent", ...f })) : [];
  return [...saved, ...typed];
}

/** How many entries were logged from one saved food. */
export async function timesLoggedOf(itemId: string): Promise<number> {
  const [row] = await db.select({ n: count(fuelEntry.id) }).from(fuelEntry).where(eq(fuelEntry.itemId, itemId));
  return row?.n ?? 0;
}
