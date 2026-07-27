import { Hono } from "hono";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type {
  ExerciseKind,
  ExerciseRecords,
  LoggedSetResult,
  LogSetBody,
  SessionDetail,
  SessionExercise,
  SetLog,
  StartSessionBody,
  TodayResponse,
  UpdateSetBody,
} from "@afya/shared";
import { db } from "../db";
import { exercise, program, programDay, programExercise, setLog, workoutSession } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";
import { computeRecords, detectPrs, type RecordSet } from "../records";

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
  isWarmup: r.isWarmup,
  completedAt: r.completedAt.toISOString(),
});

type ExMeta = { name: string; kind: ExerciseKind };

async function exerciseMeta(userId: string, ids: string[]): Promise<Map<string, ExMeta>> {
  const map = new Map<string, ExMeta>();
  if (!ids.length) return map;
  const rows = await db
    .select({ id: exercise.id, name: exercise.name, kind: exercise.kind })
    .from(exercise)
    .where(and(eq(exercise.userId, userId), inArray(exercise.id, ids)));
  for (const r of rows) map.set(r.id, { name: r.name, kind: r.kind });
  return map;
}

function groupSets(
  rows: (typeof setLog.$inferSelect)[],
  meta: Map<string, ExMeta>,
  programIds: Set<string>,
): SessionExercise[] {
  const ordered = [...rows].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const groups = new Map<string, SessionExercise>();
  for (const r of ordered) {
    const m = meta.get(r.exerciseId);
    if (!m) continue;
    let g = groups.get(r.exerciseId);
    if (!g) {
      g = { exerciseId: r.exerciseId, name: m.name, kind: m.kind, fromProgram: programIds.has(r.exerciseId), sets: [] };
      groups.set(r.exerciseId, g);
    }
    g.sets.push(toSet(r));
  }
  for (const g of groups.values()) g.sets.sort((a, b) => a.setNumber - b.setNumber);
  return [...groups.values()];
}

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

async function ownedDay(userId: string, dayId: string) {
  const [row] = await db
    .select({ day: programDay })
    .from(programDay)
    .innerJoin(program, eq(programDay.programId, program.id))
    .where(and(eq(programDay.id, dayId), eq(program.userId, userId)))
    .limit(1);
  return row?.day ?? null;
}

async function todaySessionForDay(userId: string, dayId: string) {
  const [row] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.dayId, dayId)))
    .orderBy(desc(workoutSession.performedAt))
    .limit(1);
  return row && isToday(row.performedAt) ? row : null;
}

async function buildDayExercises(userId: string, dayId: string, session: typeof workoutSession.$inferSelect | null) {
  const dayExercises = await db
    .select({ pe: programExercise, ex: exercise })
    .from(programExercise)
    .innerJoin(exercise, eq(programExercise.exerciseId, exercise.id))
    .where(eq(programExercise.dayId, dayId))
    .orderBy(asc(programExercise.position));

  const liveSets = session
    ? await db.select().from(setLog).where(eq(setLog.sessionId, session.id)).orderBy(asc(setLog.setNumber))
    : [];

  const programIds = new Set(dayExercises.map(({ ex }) => ex.id));

  const planned = await Promise.all(
    dayExercises.map(async ({ pe, ex }) => {
      const last = await lastSetFor(userId, ex.id, session?.id);
      return {
        exerciseId: ex.id,
        name: ex.name,
        kind: ex.kind,
        fromProgram: true,
        targetSets: pe.targetSets,
        targetReps: pe.targetReps,
        targetRepsMax: pe.targetRepsMax,
        targetDurationSec: pe.targetDurationSec,
        restSec: pe.restSec,
        note: pe.note,
        supersetGroup: pe.supersetGroup,
        section: pe.section,
        lastWeight: last?.weight ?? null,
        lastReps: last?.reps ?? null,
        lastDurationSec: last?.durationSec ?? null,
        loggedSets: liveSets.filter((s) => s.exerciseId === ex.id).map(toSet),
      };
    }),
  );

  const adhocIds = [...new Set(liveSets.map((s) => s.exerciseId).filter((id) => !programIds.has(id)))];
  const adhocMeta = await exerciseMeta(userId, adhocIds);
  const adhoc = await Promise.all(
    adhocIds.map(async (id) => {
      const m = adhocMeta.get(id);
      const loggedSets = liveSets.filter((s) => s.exerciseId === id).map(toSet);
      const last = await lastSetFor(userId, id, session?.id);
      return {
        exerciseId: id,
        name: m?.name ?? "Exercise",
        kind: m?.kind ?? ("weighted" as ExerciseKind),
        fromProgram: false,
        targetSets: loggedSets.length,
        targetReps: 0,
        targetRepsMax: null,
        targetDurationSec: null,
        restSec: null,
        note: null,
        supersetGroup: null,
        section: null,
        lastWeight: last?.weight ?? null,
        lastReps: last?.reps ?? null,
        lastDurationSec: last?.durationSec ?? null,
        loggedSets,
      };
    }),
  );

  return [...planned, ...adhoc];
}

/** Next-up rotation day payload: per-exercise history + any live session. */
app.get("/today", async (c) => {
  const userId = c.get("userId");
  const state = await rotationState(userId);
  if (!state.currentDay) {
    return c.json({ day: null, session: null, exercises: [] } satisfies TodayResponse);
  }
  const exercises = await buildDayExercises(userId, state.currentDay.id, state.session);
  return c.json({
    day: {
      id: state.currentDay.id,
      name: state.currentDay.name,
      position: state.currentDay.position,
      warmup: state.currentDay.warmup,
      cooldown: state.currentDay.cooldown,
    },
    session: state.session ? { id: state.session.id, performedAt: state.session.performedAt.toISOString() } : null,
    exercises,
  } satisfies TodayResponse);
});

/** A specific chosen day's payload — drives the pick-a-day session screen. */
app.get("/day/:dayId", async (c) => {
  const userId = c.get("userId");
  const day = await ownedDay(userId, c.req.param("dayId"));
  if (!day) return c.json({ error: "not_found" }, 404);
  const session = await todaySessionForDay(userId, day.id);
  const exercises = await buildDayExercises(userId, day.id, session);
  return c.json({
    day: { id: day.id, name: day.name, position: day.position, warmup: day.warmup, cooldown: day.cooldown },
    session: session ? { id: session.id, performedAt: session.performedAt.toISOString() } : null,
    exercises,
  } satisfies TodayResponse);
});

/** Find-or-create today's session (for an explicit day, or the next-up day). */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<StartSessionBody>().catch(() => null);

  if (body?.dayId) {
    const day = await ownedDay(userId, body.dayId);
    if (!day) return c.json({ error: "bad_request", message: "Unknown day." }, 400);
    const existing = await todaySessionForDay(userId, day.id);
    if (existing) {
      return c.json({ id: existing.id, dayId: existing.dayId, performedAt: existing.performedAt.toISOString() });
    }
    const [row] = await db.insert(workoutSession).values({ userId, dayId: day.id, dayName: day.name }).returning();
    return c.json({ id: row!.id, dayId: row!.dayId, performedAt: row!.performedAt.toISOString() }, 201);
  }

  const state = await rotationState(userId);
  if (state.session) {
    return c.json({ id: state.session.id, dayId: state.session.dayId, performedAt: state.session.performedAt.toISOString() });
  }
  const day = state.currentDay;
  const [row] = await db
    .insert(workoutSession)
    .values({ userId, dayId: day?.id ?? null, dayName: day?.name ?? null })
    .returning();
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
      isWarmup: body.isWarmup ?? false,
    })
    .returning();

  const priorSets = await db
    .select({
      id: setLog.id,
      weight: setLog.weight,
      reps: setLog.reps,
      durationSec: setLog.durationSec,
      isWarmup: setLog.isWarmup,
      completedAt: setLog.completedAt,
    })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .where(and(eq(workoutSession.userId, userId), eq(setLog.exerciseId, ex.id), ne(setLog.id, row!.id)));
  const prs = detectPrs(ex.kind, priorSets, {
    id: row!.id,
    weight: row!.weight,
    reps: row!.reps,
    durationSec: row!.durationSec,
    isWarmup: row!.isWarmup,
    completedAt: row!.completedAt,
  });
  return c.json({ set: toSet(row!), prs } satisfies LoggedSetResult, 201);
});

/** Edit a logged set (e.g. fix a wrong weight) in a session the user owns. */
app.patch("/:id/sets/:setId", async (c) => {
  const userId = c.get("userId");
  const [session] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, c.req.param("id")), eq(workoutSession.userId, userId)))
    .limit(1);
  if (!session) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json<UpdateSetBody>().catch(() => null);
  if (!body) return c.json({ error: "bad_request" }, 400);
  const patch: Partial<typeof setLog.$inferInsert> = {};
  if (typeof body.weight === "number") patch.weight = Math.max(0, body.weight);
  if (typeof body.reps === "number") patch.reps = Math.max(0, Math.round(body.reps));
  if (typeof body.durationSec === "number") patch.durationSec = Math.max(0, Math.round(body.durationSec));
  if (typeof body.isWarmup === "boolean") patch.isWarmup = body.isWarmup;
  if (!Object.keys(patch).length) return c.json({ error: "bad_request" }, 400);

  const [row] = await db
    .update(setLog)
    .set(patch)
    .where(and(eq(setLog.id, c.req.param("setId")), eq(setLog.sessionId, session.id)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(toSet(row));
});

/** Remove a logged set, then re-sequence that exercise's set numbers to stay 1..n. */
app.delete("/:id/sets/:setId", async (c) => {
  const userId = c.get("userId");
  const [session] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, c.req.param("id")), eq(workoutSession.userId, userId)))
    .limit(1);
  if (!session) return c.json({ error: "not_found" }, 404);

  const [deleted] = await db
    .delete(setLog)
    .where(and(eq(setLog.id, c.req.param("setId")), eq(setLog.sessionId, session.id)))
    .returning();
  if (!deleted) return c.json({ error: "not_found" }, 404);

  const remaining = await db
    .select()
    .from(setLog)
    .where(and(eq(setLog.sessionId, session.id), eq(setLog.exerciseId, deleted.exerciseId)))
    .orderBy(asc(setLog.setNumber), asc(setLog.completedAt));
  await db.transaction(async (tx) => {
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i]!.setNumber !== i + 1) {
        await tx.update(setLog).set({ setNumber: i + 1 }).where(eq(setLog.id, remaining[i]!.id));
      }
    }
  });
  return c.json({ ok: true });
});

async function programIdsForDays(dayIds: string[]): Promise<Map<string, Set<string>>> {
  const byDay = new Map<string, Set<string>>();
  if (!dayIds.length) return byDay;
  const rows = await db
    .select({ dayId: programExercise.dayId, exerciseId: programExercise.exerciseId })
    .from(programExercise)
    .where(inArray(programExercise.dayId, dayIds));
  for (const r of rows) {
    let set = byDay.get(r.dayId);
    if (!set) byDay.set(r.dayId, (set = new Set()));
    set.add(r.exerciseId);
  }
  return byDay;
}

app.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = Math.min(90, Math.max(1, Number(c.req.query("limit")) || 30));
  const sessions = await db.query.workoutSession.findMany({
    where: eq(workoutSession.userId, userId),
    orderBy: desc(workoutSession.performedAt),
    limit,
    with: { day: true, sets: true },
  });

  const allExerciseIds = [...new Set(sessions.flatMap((s) => s.sets.map((r) => r.exerciseId)))];
  const meta = await exerciseMeta(userId, allExerciseIds);
  const dayIds = [...new Set(sessions.map((s) => s.dayId).filter((id): id is string => !!id))];
  const programByDay = await programIdsForDays(dayIds);

  const out: SessionDetail[] = sessions.map((s) => ({
    id: s.id,
    dayId: s.dayId,
    // Snapshot first: a renamed or deleted program day must not rewrite history.
    dayName: s.dayName ?? s.day?.name ?? null,
    performedAt: s.performedAt.toISOString(),
    note: s.note,
    exercises: groupSets(s.sets, meta, (s.dayId && programByDay.get(s.dayId)) || new Set()),
  }));
  return c.json(out);
});

app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const [session] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, c.req.param("id")), eq(workoutSession.userId, userId)))
    .limit(1);
  if (!session) return c.json({ error: "not_found" }, 404);

  const sets = await db.select().from(setLog).where(eq(setLog.sessionId, session.id));
  const meta = await exerciseMeta(userId, [...new Set(sets.map((r) => r.exerciseId))]);
  const programByDay = session.dayId ? await programIdsForDays([session.dayId]) : new Map();
  const programIds: Set<string> = (session.dayId && programByDay.get(session.dayId)) || new Set();

  // Snapshot first: a renamed or deleted program day must not rewrite history.
  // The live join is only a fallback for sessions written before the snapshot existed.
  let dayName: string | null = session.dayName;
  if (!dayName && session.dayId) {
    const [day] = await db.select({ name: programDay.name }).from(programDay).where(eq(programDay.id, session.dayId)).limit(1);
    dayName = day?.name ?? null;
  }

  const exIds = [...new Set(sets.map((r) => r.exerciseId))];
  const allTimeSets = exIds.length
    ? await db
        .select({
          exerciseId: setLog.exerciseId,
          id: setLog.id,
          weight: setLog.weight,
          reps: setLog.reps,
          durationSec: setLog.durationSec,
          isWarmup: setLog.isWarmup,
          completedAt: setLog.completedAt,
        })
        .from(setLog)
        .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
        .where(and(eq(workoutSession.userId, userId), inArray(setLog.exerciseId, exIds)))
    : [];
  const records: ExerciseRecords[] = [];
  for (const id of exIds) {
    const m = meta.get(id);
    if (!m) continue;
    const recs = computeRecords(
      m.kind,
      allTimeSets.filter((s) => s.exerciseId === id) as RecordSet[],
    );
    if (recs.length) records.push({ exerciseId: id, name: m.name, kind: m.kind, records: recs });
  }

  return c.json({
    id: session.id,
    dayId: session.dayId,
    dayName,
    performedAt: session.performedAt.toISOString(),
    note: session.note,
    exercises: groupSets(sets, meta, programIds),
    records,
  } satisfies SessionDetail);
});

export default app;
