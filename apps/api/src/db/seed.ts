import "dotenv/config";
import { eq } from "drizzle-orm";
import type { ExerciseKind } from "@afya/shared";
import { db, pool } from "./index";
import { auth } from "../auth";
import { user } from "./schema/auth";
import {
  bodyMetric,
  exercise,
  fuelEntry,
  nutritionTarget,
  program,
  programDay,
  programExercise,
  setLog,
  workoutSession,
} from "./schema/tracker";

/**
 * Local dev seed: a demo account with a PPL program spanning all three exercise
 * kinds (weighted, reps, time) and a few weeks of logged sessions, so Trends and
 * History have something to show. Safe to run once — it bails if the demo user
 * already has a program.
 *
 *   Demo login →  afya@local.dev  /  afya-dev-123
 */
const DEMO_EMAIL = "afya@local.dev";
const DEMO_PASSWORD = "afya-dev-123";

type Seed = {
  name: string;
  day: "Push" | "Pull" | "Legs";
  kind: ExerciseKind;
  sets: number;
  /** Starting value of the progressing metric (lb / reps / seconds). */
  base: number;
  /** Per-cycle increment of that metric. */
  inc: number;
  /** Fixed reps per set, for the weighted kind only. */
  reps?: number;
};

const LIBRARY: Seed[] = [
  // Push
  { name: "Bench Press", day: "Push", kind: "weighted", sets: 4, base: 215, inc: 5, reps: 5 },
  { name: "Overhead Press", day: "Push", kind: "weighted", sets: 3, base: 125, inc: 5, reps: 6 },
  { name: "Incline DB Press", day: "Push", kind: "weighted", sets: 3, base: 55, inc: 5, reps: 10 },
  { name: "Triceps Pushdown", day: "Push", kind: "weighted", sets: 3, base: 50, inc: 5, reps: 12 },
  { name: "Push-Up", day: "Push", kind: "reps", sets: 3, base: 20, inc: 2 },
  // Pull
  { name: "Deadlift", day: "Pull", kind: "weighted", sets: 3, base: 305, inc: 10, reps: 5 },
  { name: "Barbell Row", day: "Pull", kind: "weighted", sets: 3, base: 145, inc: 5, reps: 8 },
  { name: "Lat Pulldown", day: "Pull", kind: "weighted", sets: 3, base: 120, inc: 5, reps: 12 },
  { name: "Barbell Curl", day: "Pull", kind: "weighted", sets: 3, base: 60, inc: 2.5, reps: 10 },
  { name: "Pull-Up", day: "Pull", kind: "reps", sets: 3, base: 8, inc: 1 },
  // Legs
  { name: "Back Squat", day: "Legs", kind: "weighted", sets: 4, base: 255, inc: 10, reps: 5 },
  { name: "Romanian Deadlift", day: "Legs", kind: "weighted", sets: 3, base: 175, inc: 5, reps: 8 },
  { name: "Leg Press", day: "Legs", kind: "weighted", sets: 3, base: 340, inc: 10, reps: 12 },
  { name: "Calf Raise", day: "Legs", kind: "weighted", sets: 4, base: 170, inc: 10, reps: 15 },
  { name: "Plank", day: "Legs", kind: "time", sets: 3, base: 45, inc: 5 },
];
const DAY_ORDER = ["Push", "Pull", "Legs"] as const;

const targetReps = (s: Seed) => (s.kind === "weighted" ? (s.reps ?? 8) : s.kind === "reps" ? s.base : 0);
const targetDuration = (s: Seed) => (s.kind === "time" ? s.base : null);

async function main() {
  // 1) demo user (via Better Auth so the password hashes correctly)
  try {
    await auth.api.signUpEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Ribhi" } });
  } catch {
    // already exists — fine
  }
  const [u] = await db.select().from(user).where(eq(user.email, DEMO_EMAIL)).limit(1);
  if (!u) throw new Error("Could not create or find the demo user.");
  const userId = u.id;

  const existing = await db.select().from(program).where(eq(program.userId, userId)).limit(1);
  if (existing[0]) {
    console.log("↩ Demo data already present — skipping.");
    return;
  }

  // 2) nutrition target
  await db.insert(nutritionTarget).values({ userId, proteinG: 180, calories: 2600 });

  // 3) exercise library
  const exIds = new Map<string, string>();
  for (const s of LIBRARY) {
    const [row] = await db.insert(exercise).values({ userId, name: s.name, kind: s.kind }).returning();
    exIds.set(s.name, row!.id);
  }

  // 4) program → days → exercises
  const [prog] = await db.insert(program).values({ userId, name: "PPL — Summer '26" }).returning();
  const dayIds = new Map<string, string>();
  for (let i = 0; i < DAY_ORDER.length; i++) {
    const name = DAY_ORDER[i]!;
    const [d] = await db.insert(programDay).values({ programId: prog!.id, name, position: i }).returning();
    dayIds.set(name, d!.id);
    const dayEx = LIBRARY.filter((s) => s.day === name);
    for (let p = 0; p < dayEx.length; p++) {
      const s = dayEx[p]!;
      await db.insert(programExercise).values({
        dayId: d!.id,
        exerciseId: exIds.get(s.name)!,
        position: p,
        targetSets: s.sets,
        targetReps: targetReps(s),
        targetDurationSec: targetDuration(s),
      });
    }
  }

  // 5) logged history — 4 PPL cycles (12 sessions), most recent ~2 days ago
  const startToday = new Date();
  startToday.setHours(18, 0, 0, 0);
  const SESSIONS = 12;
  for (let k = 0; k < SESSIONS; k++) {
    const dayName = DAY_ORDER[k % 3]!;
    const cycle = Math.floor(k / 3);
    const daysAgo = (SESSIONS - k) * 2; // oldest ≈ 24d ago, newest ≈ 2d ago
    const performedAt = new Date(startToday);
    performedAt.setDate(startToday.getDate() - daysAgo);

    const [sess] = await db
      .insert(workoutSession)
      .values({ userId, dayId: dayIds.get(dayName)!, performedAt })
      .returning();

    for (const s of LIBRARY.filter((x) => x.day === dayName)) {
      const val = s.base + s.inc * cycle; // the progressing metric this cycle
      for (let n = 1; n <= s.sets; n++) {
        const completedAt = new Date(performedAt);
        completedAt.setMinutes(completedAt.getMinutes() + n * 3);
        await db.insert(setLog).values({
          sessionId: sess!.id,
          exerciseId: exIds.get(s.name)!,
          setNumber: n,
          weight: s.kind === "weighted" ? val : 0,
          reps: s.kind === "weighted" ? (s.reps ?? 0) : s.kind === "reps" ? val : 0,
          durationSec: s.kind === "time" ? val : 0,
          completedAt,
        });
      }
    }
  }

  // 6) bodyweight trend (~12 points, lean bulk)
  const bw = [182, 183, 182, 184, 184, 185, 184, 186, 186, 187, 186, 188];
  for (let i = 0; i < bw.length; i++) {
    const measuredAt = new Date(startToday);
    measuredAt.setDate(startToday.getDate() - (bw.length - 1 - i) * 2);
    await db.insert(bodyMetric).values({ userId, kind: "weight", value: bw[i]!, measuredAt });
  }

  // 7) fuel — last 7 days of entries (varied around the target)
  const proteins = [172, 181, 165, 184, 190, 150, 178];
  for (let d = 0; d < 7; d++) {
    const loggedAt = new Date(startToday);
    loggedAt.setDate(startToday.getDate() - (6 - d));
    loggedAt.setHours(13, 0, 0, 0);
    const p = proteins[d]!;
    await db.insert(fuelEntry).values([
      { userId, label: "Breakfast", proteinG: Math.round(p * 0.3), calories: Math.round(p * 0.3 * 14), loggedAt },
      { userId, label: "Lunch", proteinG: Math.round(p * 0.4), calories: Math.round(p * 0.4 * 15), loggedAt },
      { userId, label: "Dinner", proteinG: Math.round(p * 0.3), calories: Math.round(p * 0.3 * 15), loggedAt },
    ]);
  }

  console.log(`✓ Seeded demo data for ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
}

main()
  .catch((err) => {
    console.error("✖ seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
