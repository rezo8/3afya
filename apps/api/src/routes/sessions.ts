import { Hono } from "hono";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { LogSetBody, SetLog, StartSessionBody, TodayResponse, WorkoutSession } from "@afya/shared";
import { db } from "../db";
import { exercise, program, programDay, programExercise, setLog, workoutSession } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const isToday = (d: Date) => startOfDay(d).getTime() === startOfDay(new Date()).getTime();

const toSet = (r: typeof setLog.$inferSelect): SetLog => ({
  id: r.id,
  exerciseId: r.exerciseId,
  setNumber: r.setNumber,
  weight: r.weight,
  reps: r.reps,
  durationSec: r.durationSec,
  completedAt: r.completedAt.toISOString(),
});

/**
 * Work out where the user is in their rotation:
 *  - the active program and its days (rotation order),
 *  - today's in-progress session if one was already started today,
 *  - otherwise the next-up day = the one after the last session's day.
 */
async function rotationState(userId: string) {
  const [active] = await db
    .select()
    .from(program)
    .where(and(eq(program.userId, userId), eq(program.isActive, true)))
    .orderBy(desc(program.updatedAt))
    .limit(1);
  if (!active) return { program: null, days: [], currentDay: null, session: null } as const;

  const days = await db
    .select()
    .from(programDay)
    .where(eq(programDay.programId, active.id))
    .orderBy(asc(programDay.position));
  if (!days.length) return { program: active, days, currentDay: null, session: null } as const;

  const [latest] = await db
    .select()
    .from(workoutSession)
    .where(eq(workoutSession.userId, userId))
    .orderBy(desc(workoutSession.performedAt))
    .limit(1);

  if (latest && isToday(latest.performedAt)) {
    const currentDay = days.find((d) => d.id === latest.dayId) ?? days[0]!;
    return { program: active, days, currentDay, session: latest } as const;
  }

  const lastIdx = latest?.dayId ? days.findIndex((d) => d.id === latest.dayId) : -1;
  const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % days.length;
  return { program: active, days, currentDay: days[nextIdx]!, session: null } as const;
}

async function lastSetFor(userId: string, exerciseId: string, excludeSessionId?: string) {
  const conds = [eq(workoutSession.userId, userId), eq(setLog.exerciseId, exerciseId)];
  if (excludeSessionId) conds.push(ne(setLog.sessionId, excludeSessionId));
  const [row] = await db
    .select({ set: setLog })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .where(and(...conds))
    .orderBy(desc(setLog.completedAt))
    .limit(1);
  return row?.set ?? null;
}

/** Today screen payload: next-up day + per-exercise history + any live session. */
app.get("/today", async (c) => {
  const userId = c.get("userId");
  const state = await rotationState(userId);
  if (!state.currentDay) {
    return c.json({ day: null, session: null, exercises: [] } satisfies TodayResponse);
  }

  const dayExercises = await db
    .select({ pe: programExercise, ex: exercise })
    .from(programExercise)
    .innerJoin(exercise, eq(programExercise.exerciseId, exercise.id))
    .where(eq(programExercise.dayId, state.currentDay.id))
    .orderBy(asc(programExercise.position));

  const liveSets = state.session
    ? await db
        .select()
        .from(setLog)
        .where(eq(setLog.sessionId, state.session.id))
        .orderBy(asc(setLog.setNumber))
    : [];

  const exercises = await Promise.all(
    dayExercises.map(async ({ pe, ex }) => {
      const last = await lastSetFor(userId, ex.id, state.session?.id);
      return {
        exerciseId: ex.id,
        name: ex.name,
        kind: ex.kind,
        targetSets: pe.targetSets,
        targetReps: pe.targetReps,
        targetDurationSec: pe.targetDurationSec,
        lastWeight: last?.weight ?? null,
        lastReps: last?.reps ?? null,
        lastDurationSec: last?.durationSec ?? null,
        loggedSets: liveSets.filter((s) => s.exerciseId === ex.id).map(toSet),
      };
    }),
  );

  return c.json({
    day: { id: state.currentDay.id, name: state.currentDay.name, position: state.currentDay.position },
    session: state.session
      ? { id: state.session.id, performedAt: state.session.performedAt.toISOString() }
      : null,
    exercises,
  } satisfies TodayResponse);
});

/** Find-or-create today's session (for the next-up day, or an explicit override). */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<StartSessionBody>().catch(() => null);
  const state = await rotationState(userId);
  if (state.session) {
    return c.json({ id: state.session.id, dayId: state.session.dayId, performedAt: state.session.performedAt.toISOString() });
  }
  const dayId = body?.dayId ?? state.currentDay?.id ?? null;
  const [row] = await db.insert(workoutSession).values({ userId, dayId }).returning();
  return c.json({ id: row!.id, dayId: row!.dayId, performedAt: row!.performedAt.toISOString() }, 201);
});

/** Log one set into a session the user owns. */
app.post("/:id/sets", async (c) => {
  const userId = c.get("userId");
  const [session] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, c.req.param("id")), eq(workoutSession.userId, userId)))
    .limit(1);
  if (!session) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json<LogSetBody>().catch(() => null);
  if (!body?.exerciseId || typeof body.setNumber !== "number") {
    return c.json({ error: "bad_request", message: "exerciseId and setNumber are required." }, 400);
  }
  const [ex] = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.id, body.exerciseId), eq(exercise.userId, userId)))
    .limit(1);
  if (!ex) return c.json({ error: "bad_request", message: "Unknown exercise." }, 400);

  // Send the fields relevant to the exercise's kind; the rest default to 0.
  const [row] = await db
    .insert(setLog)
    .values({
      sessionId: session.id,
      exerciseId: ex.id,
      setNumber: Math.max(1, Math.round(body.setNumber)),
      weight: Math.max(0, body.weight ?? 0),
      reps: Math.max(0, Math.round(body.reps ?? 0)),
      durationSec: Math.max(0, Math.round(body.durationSec ?? 0)),
    })
    .returning();
  return c.json(toSet(row!), 201);
});

/** Recent sessions with their sets — powers History. */
app.get("/", async (c) => {
  const limit = Math.min(90, Math.max(1, Number(c.req.query("limit")) || 30));
  const sessions = await db.query.workoutSession.findMany({
    where: eq(workoutSession.userId, c.get("userId")),
    orderBy: desc(workoutSession.performedAt),
    limit,
    with: { day: true, sets: { orderBy: asc(setLog.setNumber) } },
  });
  const out: WorkoutSession[] = sessions.map((s) => ({
    id: s.id,
    dayId: s.dayId,
    dayName: s.day?.name ?? null,
    performedAt: s.performedAt.toISOString(),
    sets: (s.sets as (typeof setLog.$inferSelect)[]).map(toSet),
  }));
  return c.json(out);
});

export default app;
