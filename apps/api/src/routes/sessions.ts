import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type {
  ApiErrorBody,
  ExerciseKind,
  ExerciseRecords,
  LoggedSetResult,
  LogSetBody,
  SessionDetail,
  SessionExercise,
  SetLog,
  StartSessionBody,
  SubstituteBody,
  TodayExercise,
  TodayResponse,
  UpdateSetBody,
} from "@afya/shared";
import { IDEMPOTENCY_KEY_MAX } from "@afya/shared";
import { isToday } from "../day";
import { db } from "../db";
import { recordSetColumns } from "../db/record-set-columns";
import {
  exercise,
  program,
  programDay,
  programExercise,
  sessionSubstitution,
  setLog,
  workoutSession,
} from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";
import { parseDistanceUnit } from "../distance";
import { computeRecords, detectPrs } from "../records";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const toSet = (r: typeof setLog.$inferSelect): SetLog => ({
  id: r.id,
  exerciseId: r.exerciseId,
  setNumber: r.setNumber,
  weight: r.weight,
  reps: r.reps,
  durationSec: r.durationSec,
  distance: r.distance,
  distanceUnit: r.distanceUnit,
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

/**
 * A performed session's sets, one group per exercise. Kind and plannedness come from the
 * snapshots on the rows, never from the program as it stands now: removing an exercise
 * from a day must not rewrite what history says was planned.
 */
function groupSets(rows: (typeof setLog.$inferSelect)[], names: Map<string, ExMeta>): SessionExercise[] {
  const ordered = [...rows].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const groups = new Map<string, SessionExercise>();
  for (const r of ordered) {
    const m = names.get(r.exerciseId);
    if (!m) continue;
    let g = groups.get(r.exerciseId);
    if (!g) {
      g = { exerciseId: r.exerciseId, name: m.name, kind: r.exerciseKind, fromProgram: false, sets: [] };
      groups.set(r.exerciseId, g);
    }
    // Planned if any of its sets was: a swap undone mid-session leaves both kinds of row.
    g.fromProgram ||= r.fromProgram;
    g.sets.push(toSet(r));
  }
  for (const g of groups.values()) g.sets.sort((a, b) => a.setNumber - b.setNumber);
  return [...groups.values()];
}

/**
 * Work out where the user is in their rotation:
 *  - the active program and its days (rotation order),
 *  - today's in-progress session if one was already started today,
 *  - otherwise the next-up day = the one after the last day they actually logged sets on.
 */
async function rotationState(userId: string, zone: string) {
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

  // Freeform sessions belong to no day, so they neither resume a rotation day nor
  // advance the rotation — a bike ride on Tuesday must leave "next up" where it was.
  const [latestSession] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), isNotNull(workoutSession.dayId)))
    .orderBy(desc(workoutSession.performedAt))
    .limit(1);

  if (latestSession && isToday(latestSession.performedAt, zone)) {
    const currentDay = days.find((d) => d.id === latestSession.dayId) ?? days[0]!;
    return { program: active, days, currentDay, session: latestSession } as const;
  }

  const [latestSessionWithSets] = await db
    .select({ dayId: workoutSession.dayId })
    .from(workoutSession)
    .innerJoin(setLog, eq(setLog.sessionId, workoutSession.id))
    .where(and(eq(workoutSession.userId, userId), isNotNull(workoutSession.dayId)))
    .orderBy(desc(workoutSession.performedAt))
    .limit(1);

  const lastIdx = latestSessionWithSets?.dayId ? days.findIndex((d) => d.id === latestSessionWithSets.dayId) : -1;
  const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % days.length;
  return { program: active, days, currentDay: days[nextIdx]!, session: null } as const;
}

/**
 * The working sets of the most recent other session that logged this exercise, in set
 * order. Warm-ups are left out on both sides of the comparison: a warm-up occupies a set
 * number, so matching raw set numbers would score working set 1 against a warm-up.
 */
async function previousWorkingSets(userId: string, exerciseId: string, excludeSessionId?: string): Promise<SetLog[]> {
  const conds = [eq(workoutSession.userId, userId), eq(setLog.exerciseId, exerciseId), eq(setLog.isWarmup, false)];
  if (excludeSessionId) conds.push(ne(setLog.sessionId, excludeSessionId));
  const [latest] = await db
    .select({ sessionId: workoutSession.id })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .where(and(...conds))
    .orderBy(desc(workoutSession.performedAt))
    .limit(1);
  if (!latest) return [];
  const rows = await db
    .select()
    .from(setLog)
    .where(and(eq(setLog.sessionId, latest.sessionId), eq(setLog.exerciseId, exerciseId), eq(setLog.isWarmup, false)))
    .orderBy(asc(setLog.setNumber));
  return rows.map(toSet);
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

/** Today's freeform session — the one belonging to no program day — if it exists. */
async function todayFreeformSession(userId: string, zone: string) {
  const [row] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), isNull(workoutSession.dayId)))
    .orderBy(desc(workoutSession.performedAt))
    .limit(1);
  return row && isToday(row.performedAt, zone) ? row : null;
}

async function todaySessionForDay(userId: string, dayId: string, zone: string) {
  const [row] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.dayId, dayId)))
    .orderBy(desc(workoutSession.performedAt))
    .limit(1);
  return row && isToday(row.performedAt, zone) ? row : null;
}

/**
 * The exercises a session logged that no program day planned: everything in a freeform
 * session, and anything added mid-workout to a program day. An ad-hoc exercise has no
 * targets, so its "target" is simply what has been logged so far.
 */
async function adhocExercises(
  userId: string,
  session: typeof workoutSession.$inferSelect | null,
  liveSets: (typeof setLog.$inferSelect)[],
  plannedIds: Set<string>,
): Promise<TodayExercise[]> {
  const ids = [...new Set(liveSets.map((s) => s.exerciseId).filter((id) => !plannedIds.has(id)))];
  const meta = await exerciseMeta(userId, ids);
  return Promise.all(
    ids.map(async (id) => {
      const m = meta.get(id);
      const loggedSets = liveSets.filter((s) => s.exerciseId === id).map(toSet);
      return {
        exerciseId: id,
        name: m?.name ?? "Exercise",
        kind: m?.kind ?? ("weighted" as ExerciseKind),
        fromProgram: false,
        programExerciseId: null,
        substitutedFor: null,
        targetSets: loggedSets.length,
        targetReps: 0,
        targetRepsMax: null,
        targetDurationSec: null,
        restSec: null,
        note: null,
        supersetGroup: null,
        section: null,
        previousWorkingSets: await previousWorkingSets(userId, id, session?.id),
        loggedSets,
      };
    }),
  );
}

/** This session's swaps, keyed by the program slot each one replaces. */
async function substitutesForSession(
  userId: string,
  session: typeof workoutSession.$inferSelect | null,
): Promise<Map<string, typeof exercise.$inferSelect>> {
  const map = new Map<string, typeof exercise.$inferSelect>();
  if (!session) return map;
  const rows = await db
    .select({ slotId: sessionSubstitution.programExerciseId, ex: exercise })
    .from(sessionSubstitution)
    .innerJoin(exercise, eq(sessionSubstitution.exerciseId, exercise.id))
    .where(and(eq(sessionSubstitution.sessionId, session.id), eq(exercise.userId, userId)));
  for (const r of rows) map.set(r.slotId, r.ex);
  return map;
}

/** The exercises a program day is performed with this session: each slot's substitute, else its own. */
const performedExerciseIds = (
  slots: { slotId: string; exerciseId: string }[],
  substitutes: Map<string, typeof exercise.$inferSelect>,
): Set<string> => new Set(slots.map((slot) => substitutes.get(slot.slotId)?.id ?? slot.exerciseId));

/** Whether a set of this exercise, logged now, fills a slot of the session's program day. */
async function isPlannedInSession(userId: string, session: typeof workoutSession.$inferSelect, exerciseId: string) {
  if (!session.dayId) return false;
  const slots = await db
    .select({ slotId: programExercise.id, exerciseId: programExercise.exerciseId })
    .from(programExercise)
    .where(eq(programExercise.dayId, session.dayId));
  return performedExerciseIds(slots, await substitutesForSession(userId, session)).has(exerciseId);
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

  const substitutes = await substitutesForSession(userId, session);

  // A substituted slot is performed as the substitute, so the planned exercise's own id
  // is no longer "planned": sets logged against it before the swap surface as ad-hoc,
  // which is honest — they were performed.
  const programIds = performedExerciseIds(
    dayExercises.map(({ pe, ex }) => ({ slotId: pe.id, exerciseId: ex.id })),
    substitutes,
  );

  const planned = await Promise.all(
    dayExercises.map(async ({ pe, ex: planned }) => {
      const substitute = substitutes.get(pe.id);
      const ex = substitute ?? planned;
      return {
        exerciseId: ex.id,
        name: ex.name,
        kind: ex.kind,
        fromProgram: true,
        programExerciseId: pe.id,
        substitutedFor: substitute ? planned.name : null,
        targetSets: pe.targetSets,
        targetReps: pe.targetReps,
        targetRepsMax: pe.targetRepsMax,
        targetDurationSec: pe.targetDurationSec,
        restSec: pe.restSec,
        note: pe.note,
        supersetGroup: pe.supersetGroup,
        section: pe.section,
        previousWorkingSets: await previousWorkingSets(userId, ex.id, session?.id),
        loggedSets: liveSets.filter((s) => s.exerciseId === ex.id).map(toSet),
      };
    }),
  );

  return [...planned, ...(await adhocExercises(userId, session, liveSets, programIds))];
}

/** Next-up rotation day payload: per-exercise history + any live session. */
app.get("/today", async (c) => {
  const userId = c.get("userId");
  const state = await rotationState(userId, c.get("timeZone"));
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
  const session = await todaySessionForDay(userId, day.id, c.get("timeZone"));
  const exercises = await buildDayExercises(userId, day.id, session);
  return c.json({
    day: { id: day.id, name: day.name, position: day.position, warmup: day.warmup, cooldown: day.cooldown },
    session: session ? { id: session.id, performedAt: session.performedAt.toISOString() } : null,
    exercises,
  } satisfies TodayResponse);
});

/**
 * Today's freeform session: no program day, so every exercise in it is one the user
 * added by hand. `day: null` is what tells the screen it is in freeform mode.
 */
app.get("/freeform", async (c) => {
  const userId = c.get("userId");
  const session = await todayFreeformSession(userId, c.get("timeZone"));
  const liveSets = session
    ? await db.select().from(setLog).where(eq(setLog.sessionId, session.id)).orderBy(asc(setLog.setNumber))
    : [];
  return c.json({
    day: null,
    session: session ? { id: session.id, performedAt: session.performedAt.toISOString() } : null,
    exercises: await adhocExercises(userId, session, liveSets, new Set()),
  } satisfies TodayResponse);
});

/** Find-or-create today's session (for an explicit day, a freeform one, or the next-up day). */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<StartSessionBody>().catch(() => null);

  if (body?.dayId) {
    const day = await ownedDay(userId, body.dayId);
    if (!day) return c.json({ error: "bad_request", message: "Unknown day." }, 400);
    const existing = await todaySessionForDay(userId, day.id, c.get("timeZone"));
    if (existing) {
      return c.json({ id: existing.id, dayId: existing.dayId, performedAt: existing.performedAt.toISOString() });
    }
    const [row] = await db.insert(workoutSession).values({ userId, dayId: day.id, dayName: day.name }).returning();
    return c.json({ id: row!.id, dayId: row!.dayId, performedAt: row!.performedAt.toISOString() }, 201);
  }

  if (body?.freeform) {
    const existing = await todayFreeformSession(userId, c.get("timeZone"));
    if (existing) {
      return c.json({ id: existing.id, dayId: existing.dayId, performedAt: existing.performedAt.toISOString() });
    }
    const [row] = await db.insert(workoutSession).values({ userId, dayId: null, dayName: null }).returning();
    return c.json({ id: row!.id, dayId: row!.dayId, performedAt: row!.performedAt.toISOString() }, 201);
  }

  const state = await rotationState(userId, c.get("timeZone"));
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

/**
 * Swap one program slot for another exercise, for this session only.
 *
 * The substitute inherits the slot's targets, so a session stays finishable after a
 * swap; the program day is untouched, so next week still plans what it planned. Naming
 * the slot's own exercise removes the substitution, which is how a swap is undone.
 */
app.post("/:id/substitutions", async (c) => {
  const userId = c.get("userId");
  const [session] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, c.req.param("id")), eq(workoutSession.userId, userId)))
    .limit(1);
  if (!session) return c.json({ error: "not_found" }, 404);
  if (!session.dayId) {
    return c.json({ error: "bad_request", message: "A freeform session plans nothing to substitute." } satisfies ApiErrorBody, 400);
  }

  const body = await c.req.json<SubstituteBody>().catch(() => null);
  if (!body?.programExerciseId || !body.exerciseId) {
    return c.json({ error: "bad_request", message: "programExerciseId and exerciseId are required." } satisfies ApiErrorBody, 400);
  }

  const [slot] = await db
    .select()
    .from(programExercise)
    .where(and(eq(programExercise.id, body.programExerciseId), eq(programExercise.dayId, session.dayId)))
    .limit(1);
  if (!slot) return c.json({ error: "bad_request", message: "That exercise isn't in this day." } satisfies ApiErrorBody, 400);

  if (slot.exerciseId === body.exerciseId) {
    await db
      .delete(sessionSubstitution)
      .where(
        and(eq(sessionSubstitution.sessionId, session.id), eq(sessionSubstitution.programExerciseId, slot.id)),
      );
    return c.json({ substituted: false });
  }

  const [substitute] = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.id, body.exerciseId), eq(exercise.userId, userId), isNull(exercise.archivedAt)))
    .limit(1);
  if (!substitute) return c.json({ error: "bad_request", message: "Unknown exercise." } satisfies ApiErrorBody, 400);

  // Two slots performing the same exercise would share one pool of logged sets, so each
  // would read as the other's progress. Refuse rather than show a number that isn't true.
  const slots = await db.select().from(programExercise).where(eq(programExercise.dayId, session.dayId));
  const substitutes = await substitutesForSession(userId, session);
  const alreadyInDay = slots.some(
    (other) => other.id !== slot.id && (substitutes.get(other.id)?.id ?? other.exerciseId) === substitute.id,
  );
  if (alreadyInDay) {
    return c.json({ error: "bad_request", message: `${substitute.name} is already in this day.` } satisfies ApiErrorBody, 400);
  }

  await db
    .insert(sessionSubstitution)
    .values({ sessionId: session.id, programExerciseId: slot.id, exerciseId: substitute.id })
    .onConflictDoUpdate({
      target: [sessionSubstitution.sessionId, sessionSubstitution.programExerciseId],
      set: { exerciseId: substitute.id },
    });
  return c.json({ substituted: true });
});

/**
 * The caller's key if they sent a usable one, else null — a malformed key means the
 * request is treated as keyless, which is what every request did before this existed.
 * Rejecting it would turn a bad optional field into a failure to record a set the user
 * actually performed, and the set is the thing worth protecting.
 */
function parseIdempotencyKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > IDEMPOTENCY_KEY_MAX) return null;
  return trimmed;
}

/** The set this key already logged in this session, if it is still there. */
async function replayedSet(sessionId: string, idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(setLog)
    .where(and(eq(setLog.sessionId, sessionId), eq(setLog.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ?? null;
}

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

  const idempotencyKey = parseIdempotencyKey(body.idempotencyKey);

  // Send the fields relevant to the exercise's kind; the rest default to 0.
  const [inserted] = await db
    .insert(setLog)
    .values({
      sessionId: session.id,
      exerciseId: ex.id,
      setNumber: Math.max(1, Math.round(body.setNumber)),
      weight: Math.max(0, body.weight ?? 0),
      reps: Math.max(0, Math.round(body.reps ?? 0)),
      durationSec: Math.max(0, Math.round(body.durationSec ?? 0)),
      distance: Math.max(0, body.distance ?? 0),
      // A distance with no recognized unit is not a distance — drop both rather than
      // guessing at miles.
      distanceUnit: parseDistanceUnit(body.distanceUnit),
      isWarmup: body.isWarmup ?? false,
      fromProgram: await isPlannedInSession(userId, session, ex.id),
      exerciseKind: ex.kind,
      idempotencyKey,
    })
    .onConflictDoNothing({ target: [setLog.sessionId, setLog.idempotencyKey] })
    .returning();

  // Nothing came back: this key already logged a set in this session, so the request is
  // the same set-completion arriving twice. Answer with the row it logged the first time.
  const row = inserted ?? (idempotencyKey ? await replayedSet(session.id, idempotencyKey) : null);
  if (!row) {
    // Reachable when a concurrent DELETE removes the conflicting row between the insert
    // and this read. 409 is not retryable, so this message is the whole response the
    // user gets — say what happened to their set, not what happened to the database.
    return c.json({ error: "conflict", message: "That set didn't save. Log it again." }, 409);
  }

  const priorSets = await db
    .select(recordSetColumns)
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .where(and(eq(workoutSession.userId, userId), eq(setLog.exerciseId, ex.id), ne(setLog.id, row.id)));
  const prs = detectPrs(ex.kind, priorSets, {
    id: row.id,
    weight: row.weight,
    reps: row.reps,
    durationSec: row.durationSec,
    distance: row.distance,
    distanceUnit: row.distanceUnit,
    isWarmup: row.isWarmup,
    completedAt: row.completedAt,
  });
  return c.json({ set: toSet(row), prs } satisfies LoggedSetResult, inserted ? 201 : 200);
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
  if (typeof body.distance === "number") patch.distance = Math.max(0, body.distance);
  const distanceUnit = parseDistanceUnit(body.distanceUnit);
  if (distanceUnit) patch.distanceUnit = distanceUnit;
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

  const out: SessionDetail[] = sessions.map((s) => ({
    id: s.id,
    dayId: s.dayId,
    // Snapshot first: a renamed or deleted program day must not rewrite history.
    dayName: s.dayName ?? s.day?.name ?? null,
    performedAt: s.performedAt.toISOString(),
    note: s.note,
    exercises: groupSets(s.sets, meta),
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
        .select({ exerciseId: setLog.exerciseId, ...recordSetColumns })
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
      allTimeSets.filter((s) => s.exerciseId === id),
    );
    if (recs.length) records.push({ exerciseId: id, name: m.name, kind: m.kind, records: recs });
  }

  return c.json({
    id: session.id,
    dayId: session.dayId,
    dayName,
    performedAt: session.performedAt.toISOString(),
    note: session.note,
    exercises: groupSets(sets, meta),
    records,
  } satisfies SessionDetail);
});

/**
 * Discard a session that was started but never logged into. A session holding sets
 * is a performed record and stays; an empty one has no performed content to protect.
 */
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const [session] = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, c.req.param("id")), eq(workoutSession.userId, userId)))
    .limit(1);
  if (!session) return c.json({ error: "not_found" }, 404);

  const [loggedSet] = await db.select({ id: setLog.id }).from(setLog).where(eq(setLog.sessionId, session.id)).limit(1);
  if (loggedSet) {
    return c.json(
      { error: "bad_request", message: "Sessions with logged sets can't be deleted." } satisfies ApiErrorBody,
      400,
    );
  }

  await db.delete(workoutSession).where(eq(workoutSession.id, session.id));
  return c.json({ ok: true });
});

export default app;
