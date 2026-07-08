import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import type {
  AddDayExerciseBody,
  CreateDayBody,
  CreateProgramBody,
  ExerciseKind,
  Program,
  ProgramDay,
  ReorderBody,
  UpdateDayExerciseBody,
} from "@afya/shared";
import { db } from "../db";
import { exercise, program, programDay, programExercise } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

// --- ownership helpers (never trust a client-supplied id) ------------------

/** Resolve a day the user owns (day → program.userId), or null. */
async function ownedDay(userId: string, dayId: string) {
  const [row] = await db
    .select({ day: programDay })
    .from(programDay)
    .innerJoin(program, eq(programDay.programId, program.id))
    .where(and(eq(programDay.id, dayId), eq(program.userId, userId)))
    .limit(1);
  return row?.day ?? null;
}

/** Resolve a program-exercise the user owns (pe → day → program.userId), or null. */
async function ownedDayExercise(userId: string, peId: string) {
  const [row] = await db
    .select({ pe: programExercise })
    .from(programExercise)
    .innerJoin(programDay, eq(programExercise.dayId, programDay.id))
    .innerJoin(program, eq(programDay.programId, program.id))
    .where(and(eq(programExercise.id, peId), eq(program.userId, userId)))
    .limit(1);
  return row?.pe ?? null;
}

type FullDay = {
  id: string;
  name: string;
  position: number;
  exercises: {
    id: string;
    exerciseId: string;
    position: number;
    targetSets: number;
    targetReps: number;
    targetDurationSec: number | null;
    exercise: { name: string; kind: ExerciseKind };
  }[];
};

const toDay = (d: FullDay): ProgramDay => ({
  id: d.id,
  name: d.name,
  position: d.position,
  exercises: d.exercises.map((e) => ({
    id: e.id,
    exerciseId: e.exerciseId,
    name: e.exercise.name,
    kind: e.exercise.kind,
    position: e.position,
    targetSets: e.targetSets,
    targetReps: e.targetReps,
    targetDurationSec: e.targetDurationSec,
  })),
});

// --- programs --------------------------------------------------------------

/** All programs, active first, with days → exercises fully nested. */
app.get("/", async (c) => {
  const rows = await db.query.program.findMany({
    where: eq(program.userId, c.get("userId")),
    orderBy: [desc(program.isActive), asc(program.createdAt)],
    with: {
      days: {
        orderBy: asc(programDay.position),
        with: {
          exercises: {
            orderBy: asc(programExercise.position),
            with: { exercise: true },
          },
        },
      },
    },
  });
  const programs: Program[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    days: (p.days as FullDay[]).map(toDay),
  }));
  return c.json(programs);
});

app.post("/", async (c) => {
  const body = await c.req.json<CreateProgramBody>().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "bad_request", message: "A program name is required." }, 400);
  const [row] = await db
    .insert(program)
    .values({ userId: c.get("userId"), name })
    .returning();
  return c.json({ id: row!.id, name: row!.name, isActive: row!.isActive, days: [] } satisfies Program, 201);
});

app.delete("/:id", async (c) => {
  const deleted = await db
    .delete(program)
    .where(and(eq(program.id, c.req.param("id")), eq(program.userId, c.get("userId"))))
    .returning();
  if (!deleted[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// --- days ------------------------------------------------------------------

app.post("/:id/days", async (c) => {
  const programId = c.req.param("id");
  const [owned] = await db
    .select()
    .from(program)
    .where(and(eq(program.id, programId), eq(program.userId, c.get("userId"))))
    .limit(1);
  if (!owned) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json<CreateDayBody>().catch(() => null);
  const name = body?.name?.trim() || "New day";
  const existing = await db.select().from(programDay).where(eq(programDay.programId, programId));
  const [row] = await db
    .insert(programDay)
    .values({ programId, name, position: existing.length })
    .returning();
  return c.json({ id: row!.id, name: row!.name, position: row!.position, exercises: [] } satisfies ProgramDay, 201);
});

app.patch("/days/:dayId", async (c) => {
  const day = await ownedDay(c.get("userId"), c.req.param("dayId"));
  if (!day) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return c.json({ error: "bad_request", message: "A day name is required." }, 400);
  await db.update(programDay).set({ name }).where(eq(programDay.id, day.id));
  return c.json({ ok: true });
});

app.delete("/days/:dayId", async (c) => {
  const day = await ownedDay(c.get("userId"), c.req.param("dayId"));
  if (!day) return c.json({ error: "not_found" }, 404);
  await db.delete(programDay).where(eq(programDay.id, day.id));
  return c.json({ ok: true });
});

/** Reorder the days of a program (rotation order). */
app.post("/:id/days/reorder", async (c) => {
  const programId = c.req.param("id");
  const [owned] = await db
    .select()
    .from(program)
    .where(and(eq(program.id, programId), eq(program.userId, c.get("userId"))))
    .limit(1);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json<ReorderBody>().catch(() => null);
  if (!body?.order?.length) return c.json({ error: "bad_request" }, 400);
  await db.transaction(async (tx) => {
    for (let i = 0; i < body.order.length; i++) {
      await tx
        .update(programDay)
        .set({ position: i })
        .where(and(eq(programDay.id, body.order[i]!), eq(programDay.programId, programId)));
    }
  });
  return c.json({ ok: true });
});

// --- exercises within a day ------------------------------------------------

app.post("/days/:dayId/exercises", async (c) => {
  const userId = c.get("userId");
  const day = await ownedDay(userId, c.req.param("dayId"));
  if (!day) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json<AddDayExerciseBody>().catch(() => null);
  if (!body?.exerciseId) return c.json({ error: "bad_request", message: "exerciseId is required." }, 400);
  // Confirm the exercise is in the user's library.
  const [ex] = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.id, body.exerciseId), eq(exercise.userId, userId)))
    .limit(1);
  if (!ex) return c.json({ error: "bad_request", message: "Unknown exercise." }, 400);

  const existing = await db.select().from(programExercise).where(eq(programExercise.dayId, day.id));
  const targetDurationSec = body.targetDurationSec ?? (ex.kind === "time" ? 30 : null);
  const [row] = await db
    .insert(programExercise)
    .values({
      dayId: day.id,
      exerciseId: ex.id,
      position: existing.length,
      targetSets: body.targetSets ?? 3,
      targetReps: body.targetReps ?? (ex.kind === "time" ? 0 : 8),
      targetDurationSec,
    })
    .returning();
  return c.json(
    {
      id: row!.id,
      exerciseId: ex.id,
      name: ex.name,
      kind: ex.kind,
      position: row!.position,
      targetSets: row!.targetSets,
      targetReps: row!.targetReps,
      targetDurationSec: row!.targetDurationSec,
    },
    201,
  );
});

app.patch("/day-exercises/:id", async (c) => {
  const pe = await ownedDayExercise(c.get("userId"), c.req.param("id"));
  if (!pe) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json<UpdateDayExerciseBody>().catch(() => null);
  if (!body) return c.json({ error: "bad_request" }, 400);
  const patch: Partial<typeof programExercise.$inferInsert> = {};
  if (typeof body.targetSets === "number") patch.targetSets = Math.max(1, Math.round(body.targetSets));
  if (typeof body.targetReps === "number") patch.targetReps = Math.max(1, Math.round(body.targetReps));
  if (body.targetDurationSec !== undefined)
    patch.targetDurationSec = body.targetDurationSec === null ? null : Math.max(1, Math.round(body.targetDurationSec));
  if (typeof body.position === "number") patch.position = Math.max(0, Math.round(body.position));
  if (Object.keys(patch).length) await db.update(programExercise).set(patch).where(eq(programExercise.id, pe.id));
  return c.json({ ok: true });
});

app.delete("/day-exercises/:id", async (c) => {
  const pe = await ownedDayExercise(c.get("userId"), c.req.param("id"));
  if (!pe) return c.json({ error: "not_found" }, 404);
  await db.delete(programExercise).where(eq(programExercise.id, pe.id));
  return c.json({ ok: true });
});

/** Reorder the exercises within a day. */
app.post("/days/:dayId/exercises/reorder", async (c) => {
  const day = await ownedDay(c.get("userId"), c.req.param("dayId"));
  if (!day) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json<ReorderBody>().catch(() => null);
  if (!body?.order?.length) return c.json({ error: "bad_request" }, 400);
  await db.transaction(async (tx) => {
    for (let i = 0; i < body.order.length; i++) {
      await tx
        .update(programExercise)
        .set({ position: i })
        .where(and(eq(programExercise.id, body.order[i]!), eq(programExercise.dayId, day.id)));
    }
  });
  return c.json({ ok: true });
});

export default app;
