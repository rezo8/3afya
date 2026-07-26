import { Hono } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { CreateExerciseBody, Exercise, ExerciseKind } from "@afya/shared";
import { db } from "../db";
import { exercise, setLog } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const KINDS: ExerciseKind[] = ["weighted", "reps", "time"];
const toKind = (k: unknown): ExerciseKind => (KINDS.includes(k as ExerciseKind) ? (k as ExerciseKind) : "weighted");

// Postgres error code for a foreign-key violation (pg's DatabaseError exposes it as `.code`).
const FOREIGN_KEY_VIOLATION = "23503";
const isForeignKeyViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && err.code === FOREIGN_KEY_VIOLATION;

const toExercise = (r: typeof exercise.$inferSelect): Exercise => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  createdAt: r.createdAt.toISOString(),
  archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
});

/** List the user's active exercise library, alphabetical. Archived exercises are hidden. */
app.get("/", async (c) => {
  const rows = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.userId, c.get("userId")), isNull(exercise.archivedAt)))
    .orderBy(asc(exercise.name));
  return c.json(rows.map(toExercise));
});

/** Create a library exercise (idempotent on name per user; revives an archived one on name collision). */
app.post("/", async (c) => {
  const body = await c.req.json<CreateExerciseBody>().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "bad_request", message: "A name is required." }, 400);

  const userId = c.get("userId");
  const existing = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.userId, userId), eq(exercise.name, name)))
    .limit(1);
  if (existing[0]) {
    // (userId, name) is unique, so an archived row is the only one this name can ever resolve
    // to again — resurrect it rather than leaving the name permanently unusable.
    if (existing[0].archivedAt) {
      const [revived] = await db
        .update(exercise)
        .set({ archivedAt: null })
        .where(eq(exercise.id, existing[0].id))
        .returning();
      return c.json(toExercise(revived!), 200);
    }
    return c.json(toExercise(existing[0]), 200);
  }

  const [row] = await db
    .insert(exercise)
    .values({ userId, name, kind: toKind(body?.kind) })
    .returning();
  return c.json(toExercise(row!), 201);
});

/**
 * Delete a library exercise. Set logs are historical training data and must
 * never be lost, so an exercise with any logged sets is archived (hidden from
 * the library, but its id and history stay intact) instead of hard-deleted.
 * Only an exercise with no set logs is actually removed. Program-day rows
 * referencing this exercise are still cascade-deleted either way.
 */
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const [owned] = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.id, c.req.param("id")), eq(exercise.userId, userId)))
    .limit(1);
  if (!owned) return c.json({ error: "not_found" }, 404);

  const [hasSetLogs] = await db.select({ id: setLog.id }).from(setLog).where(eq(setLog.exerciseId, owned.id)).limit(1);
  if (hasSetLogs) {
    await db.update(exercise).set({ archivedAt: new Date() }).where(eq(exercise.id, owned.id));
    return c.json({ ok: true });
  }

  try {
    await db.delete(exercise).where(eq(exercise.id, owned.id));
  } catch (err) {
    // A set could have been logged in the race window between the check above and this
    // delete; fall back to archiving rather than letting the FK violation surface.
    if (!isForeignKeyViolation(err)) throw err;
    await db.update(exercise).set({ archivedAt: new Date() }).where(eq(exercise.id, owned.id));
  }
  return c.json({ ok: true });
});

export default app;
