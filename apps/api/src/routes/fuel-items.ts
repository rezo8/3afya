import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import type { FuelItems, SaveFuelItemBody } from "@afya/shared";
import { db } from "../db";
import { fuelItem } from "../db/schema/tracker";
import { itemsFor, optionalGrams, timesLoggedOf, toItem, unsavedFrequentFor } from "../fuel-queries";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

/** How many typed-but-unsaved labels the Foods screen offers to save. */
const UNSAVED_LIMIT = 8;

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

/** A saved food's fields, or null when it has no name or no unit — a food with neither is not one. */
function readItemFields(body: SaveFuelItemBody | null) {
  const label = body?.label?.trim();
  const unit = body?.unit?.trim();
  if (!label || !unit) return null;
  return {
    label,
    unit,
    proteinG: Math.max(0, body?.proteinG ?? 0),
    calories: Math.max(0, Math.round(body?.calories ?? 0)),
    carbsG: optionalGrams(body?.carbsG),
    fatG: optionalGrams(body?.fatG),
  };
}

app.get("/", async (c) => {
  const userId = c.get("userId");
  const items = await itemsFor(userId);
  const unsaved = await unsavedFrequentFor(userId, items, UNSAVED_LIMIT);
  return c.json({ items, unsaved } satisfies FuelItems);
});

/**
 * Save a food. A label that belongs to an archived food brings that food back with the new
 * numbers rather than refusing the name forever, the same rule exercises follow.
 */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const fields = readItemFields(await c.req.json<SaveFuelItemBody>().catch(() => null));
  if (!fields) return c.json({ error: "bad_request", message: "A food needs a name and a unit." }, 400);
  const [existing] = await db
    .select()
    .from(fuelItem)
    .where(and(eq(fuelItem.userId, userId), eq(fuelItem.label, fields.label)))
    .limit(1);
  if (existing && !existing.archivedAt) {
    return c.json({ error: "conflict", message: `You already have a food called ${fields.label}.` }, 409);
  }
  const [row] = existing
    ? await db.update(fuelItem).set({ ...fields, archivedAt: null }).where(eq(fuelItem.id, existing.id)).returning()
    : await db.insert(fuelItem).values({ userId, ...fields }).returning();
  return c.json(toItem(row!, await timesLoggedOf(row!.id)), existing ? 200 : 201);
});

/** Change a food from now on. Entries already logged from it keep their own numbers. */
app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const fields = readItemFields(await c.req.json<SaveFuelItemBody>().catch(() => null));
  if (!fields) return c.json({ error: "bad_request", message: "A food needs a name and a unit." }, 400);
  const [clash] = await db
    .select({ id: fuelItem.id })
    .from(fuelItem)
    .where(and(eq(fuelItem.userId, userId), eq(fuelItem.label, fields.label)))
    .limit(1);
  if (clash && clash.id !== c.req.param("id")) {
    return c.json({ error: "conflict", message: `You already have a food called ${fields.label}.` }, 409);
  }
  const [row] = await db
    .update(fuelItem)
    .set(fields)
    .where(and(eq(fuelItem.id, c.req.param("id")), eq(fuelItem.userId, userId), isNull(fuelItem.archivedAt)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(toItem(row, await timesLoggedOf(row.id)));
});

/** Archive, never delete: entries point at it, and the name can be brought back by saving it again. */
app.delete("/:id", async (c) => {
  const [row] = await db
    .update(fuelItem)
    .set({ archivedAt: new Date() })
    .where(and(eq(fuelItem.id, c.req.param("id")), eq(fuelItem.userId, c.get("userId")), isNull(fuelItem.archivedAt)))
    .returning({ id: fuelItem.id });
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

export default app;
