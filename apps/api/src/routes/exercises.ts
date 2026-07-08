import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import type { CreateExerciseBody, Exercise, ExerciseKind } from "@afya/shared";
import { db } from "../db";
import { exercise } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const KINDS: ExerciseKind[] = ["weighted", "reps", "time"];
const toKind = (k: unknown): ExerciseKind => (KINDS.includes(k as ExerciseKind) ? (k as ExerciseKind) : "weighted");

const toExercise = (r: typeof exercise.$inferSelect): Exercise => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  createdAt: r.createdAt.toISOString(),
});

/** List the user's exercise library, alphabetical. */
app.get("/", async (c) => {
  const rows = await db
    .select()
    .from(exercise)
    .where(eq(exercise.userId, c.get("userId")))
    .orderBy(asc(exercise.name));
  return c.json(rows.map(toExercise));
});

/** Create a library exercise (idempotent on name per user). */
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
  if (existing[0]) return c.json(toExercise(existing[0]), 200);

  const [row] = await db
    .insert(exercise)
    .values({ userId, name, kind: toKind(body?.kind) })
    .returning();
  return c.json(toExercise(row!), 201);
});

/** Delete a library exercise (cascades to its program rows and set logs). */
app.delete("/:id", async (c) => {
  const deleted = await db
    .delete(exercise)
    .where(and(eq(exercise.id, c.req.param("id")), eq(exercise.userId, c.get("userId"))))
    .returning();
  if (!deleted[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

export default app;
