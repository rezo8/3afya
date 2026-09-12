import { Hono } from "hono";
import { and, asc, desc, eq, max } from "drizzle-orm";
import type { DistanceUnit, ExerciseKind, ProgressMetric, ProgressTrend, TrendExercise, TrendPoint } from "@afya/shared";
import { db } from "../db";
import { exercise, setLog, workoutSession } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";
import { fromMetres, toMetres } from "../distance";
import { epley } from "../records";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

const METRIC_BY_KIND: Record<ExerciseKind, ProgressMetric> = {
  weighted: "est1rm",
  reps: "reps",
  time: "time",
  distance: "distance",
};

/** Display unit for every metric whose unit is fixed; distance chooses its own. */
const UNIT_BY_METRIC: Record<Exclude<ProgressMetric, "distance">, string> = {
  est1rm: "lb",
  time: "s",
  reps: "reps",
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Exercises that have at least one logged set, most recently trained first. */
app.get("/exercises", async (c) => {
  const rows = await db
    .select({ id: exercise.id, name: exercise.name, kind: exercise.kind })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .innerJoin(exercise, eq(setLog.exerciseId, exercise.id))
    .where(eq(workoutSession.userId, c.get("userId")))
    .groupBy(exercise.id, exercise.name, exercise.kind)
    .orderBy(desc(max(setLog.completedAt)), asc(exercise.name));
  return c.json(rows satisfies TrendExercise[]);
});

/**
 * Progress over time for one exercise — best set per session. What "best" means
 * depends on the exercise kind:
 *   weighted → estimated 1RM (Epley)   reps → most reps   time → longest hold
 *   distance → furthest, charted in the unit that exercise was last logged in
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
      distance: setLog.distance,
      distanceUnit: setLog.distanceUnit,
      isWarmup: setLog.isWarmup,
      performedAt: workoutSession.performedAt,
    })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .where(and(eq(workoutSession.userId, userId), eq(setLog.exerciseId, exerciseId)))
    .orderBy(asc(workoutSession.performedAt));

  const metric = METRIC_BY_KIND[ex.kind];
  // A distance exercise is charted in the unit it was logged in most recently, so the
  // line reads in the units the user actually thinks in. Sets are scored in metres and
  // converted back, so a stretch logged in km still plots against one logged in miles.
  const chartUnit: DistanceUnit = rows.findLast((r) => r.distanceUnit)?.distanceUnit ?? "mi";
  const unit = metric === "distance" ? chartUnit : UNIT_BY_METRIC[metric];
  const score = (r: (typeof rows)[number]) => {
    switch (metric) {
      case "est1rm":
        return epley(r.weight, r.reps);
      case "time":
        return r.durationSec;
      case "distance":
        return fromMetres(toMetres(r.distance, r.distanceUnit), chartUnit);
      case "reps":
        return r.reps;
    }
  };

  const bySession = new Map<string, { date: Date; best: number }>();
  for (const r of rows) {
    if (r.isWarmup) continue;
    const s = score(r);
    const cur = bySession.get(r.sessionId);
    if (!cur) bySession.set(r.sessionId, { date: r.performedAt, best: s });
    else if (s > cur.best) cur.best = s;
  }

  const points: TrendPoint[] = [...bySession.values()]
    .filter((p) => p.best > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    // Distances are small numbers where the decimal is the whole story (7.2 mi, not 7).
    .map((p) => ({ date: p.date.toISOString(), value: metric === "distance" ? round1(p.best) : Math.round(p.best) }));

  return c.json({ exerciseId: ex.id, name: ex.name, kind: ex.kind, metric, unit, points } satisfies ProgressTrend);
});

export default app;
