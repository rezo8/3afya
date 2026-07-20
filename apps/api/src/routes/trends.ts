import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import type { ProgressMetric, ProgressTrend, TrendExercise, TrendPoint } from "@afya/shared";
import { db } from "../db";
import { exercise, setLog, workoutSession } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";
import { epley } from "../records";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

/** Exercises that have at least one logged set — the picker list for trends. */
app.get("/exercises", async (c) => {
  const rows = await db
    .select({ id: exercise.id, name: exercise.name, kind: exercise.kind })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .innerJoin(exercise, eq(setLog.exerciseId, exercise.id))
    .where(eq(workoutSession.userId, c.get("userId")))
    .groupBy(exercise.id, exercise.name, exercise.kind)
    .orderBy(asc(exercise.name));
  return c.json(rows satisfies TrendExercise[]);
});

/**
 * Progress over time for one exercise — best set per session. What "best" means
 * depends on the exercise kind:
 *   weighted → estimated 1RM (Epley)   reps → most reps   time → longest hold
 */
app.get("/progress", async (c) => {
  const userId = c.get("userId");
  const exerciseId = c.req.query("exerciseId");
  if (!exerciseId) return c.json({ error: "bad_request", message: "exerciseId is required." }, 400);

  const [ex] = await db
    .select()
    .from(exercise)
    .where(and(eq(exercise.id, exerciseId), eq(exercise.userId, userId)))
    .limit(1);
  if (!ex) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      sessionId: setLog.sessionId,
      weight: setLog.weight,
      reps: setLog.reps,
      durationSec: setLog.durationSec,
      performedAt: workoutSession.performedAt,
    })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .where(and(eq(workoutSession.userId, userId), eq(setLog.exerciseId, exerciseId)))
    .orderBy(asc(workoutSession.performedAt));

  const metric: ProgressMetric = ex.kind === "weighted" ? "est1rm" : ex.kind === "time" ? "time" : "reps";
  const unit = metric === "est1rm" ? "lb" : metric === "time" ? "s" : "reps";
  const score = (r: { weight: number; reps: number; durationSec: number }) =>
    metric === "est1rm" ? epley(r.weight, r.reps) : metric === "time" ? r.durationSec : r.reps;

  const bySession = new Map<string, { date: Date; best: number }>();
  for (const r of rows) {
    const s = score(r);
    const cur = bySession.get(r.sessionId);
    if (!cur) bySession.set(r.sessionId, { date: r.performedAt, best: s });
    else if (s > cur.best) cur.best = s;
  }

  const points: TrendPoint[] = [...bySession.values()]
    .filter((p) => p.best > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((p) => ({ date: p.date.toISOString(), value: Math.round(p.best) }));

  return c.json({ exerciseId: ex.id, name: ex.name, kind: ex.kind, metric, unit, points } satisfies ProgressTrend);
});

export default app;
