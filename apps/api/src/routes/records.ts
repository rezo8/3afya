import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { ExerciseKind, ExerciseRecords } from "@afya/shared";
import { db } from "../db";
import { exercise, setLog, workoutSession } from "../db/schema/tracker";
import { requireAuth, type AuthedEnv } from "../middleware/require-auth";
import { computeRecords, type RecordSet } from "../records";

const app = new Hono<AuthedEnv>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const rows = await db
    .select({
      exerciseId: exercise.id,
      name: exercise.name,
      kind: exercise.kind,
      id: setLog.id,
      weight: setLog.weight,
      reps: setLog.reps,
      durationSec: setLog.durationSec,
      isWarmup: setLog.isWarmup,
      completedAt: setLog.completedAt,
    })
    .from(setLog)
    .innerJoin(workoutSession, eq(setLog.sessionId, workoutSession.id))
    .innerJoin(exercise, eq(setLog.exerciseId, exercise.id))
    .where(eq(workoutSession.userId, c.get("userId")));

  const byExercise = new Map<string, { name: string; kind: ExerciseKind; sets: RecordSet[] }>();
  for (const r of rows) {
    let g = byExercise.get(r.exerciseId);
    if (!g) byExercise.set(r.exerciseId, (g = { name: r.name, kind: r.kind, sets: [] }));
    g.sets.push({ id: r.id, weight: r.weight, reps: r.reps, durationSec: r.durationSec, isWarmup: r.isWarmup, completedAt: r.completedAt });
  }

  const out: ExerciseRecords[] = [...byExercise.entries()]
    .map(([exerciseId, g]) => ({ exerciseId, name: g.name, kind: g.kind, records: computeRecords(g.kind, g.sets) }))
    .filter((e) => e.records.length)
    .sort((a, b) => a.name.localeCompare(b.name));

  return c.json(out);
});

export default app;
