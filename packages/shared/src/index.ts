/**
 * Shared API contract types between the afya backend (apps/api) and web (apps/web).
 * Keep this dependency-free — it is consumed as raw TypeScript source by both apps.
 *
 * Model summary (all rows are user-scoped):
 *  - Exercises are a shared library, reused across program days.
 *  - Each exercise has a measurement KIND that decides what a set records:
 *      weighted → weight (lb) × reps   (bench press)
 *      reps     → reps / count only    (pull-ups, soccer drills)
 *      time     → duration in seconds  (planks, timed holds)
 *  - A program is a set of named days in a rotation order (not weekday-pinned).
 *  - A day holds ordered exercises with targets (sets × reps, or sets × time).
 *    No planned weight — working weight lives in logged sets and "today"
 *    pre-fills it from the last session.
 *  - Fuel is logged per entry (add/remove) against a daily protein/calorie target.
 */

/** Standard JSON error body returned by the API. */
export interface ApiErrorBody {
  error: string;
  message?: string;
}

/** How an exercise is measured — decides which fields a set records. */
export type ExerciseKind = "weighted" | "reps" | "time";

/** The muscle group an exercise mainly trains — the axis substitutions pivot on. */
export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "full_body";

/** What an exercise is performed with — the axis a swap usually trades away. */
export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "kettlebell" | "band" | "other";

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export interface Exercise {
  id: string;
  name: string;
  kind: ExerciseKind;
  /** Null when the name never matched the curated catalog — an untagged exercise gets no suggestions. */
  primaryMuscleGroup: MuscleGroup | null;
  equipment: Equipment | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface CreateExerciseBody {
  name: string;
  kind?: ExerciseKind;
}

/**
 * A stand-in for an exercise, sharing its primary muscle group. Either one of the
 * user's own library exercises (`inLibrary: true`, with an `id`) or a curated catalog
 * entry they don't have yet (`inLibrary: false`, `id: null` — adding it is the next step).
 */
export interface ExerciseAlternative {
  id: string | null;
  name: string;
  kind: ExerciseKind;
  primaryMuscleGroup: MuscleGroup;
  equipment: Equipment | null;
  inLibrary: boolean;
}

// ---------------------------------------------------------------------------
// Program (rotation of days → ordered exercises)
// ---------------------------------------------------------------------------

export interface ProgramExercise {
  id: string;
  exerciseId: string;
  /** Denormalized from the exercise for convenient rendering. */
  name: string;
  kind: ExerciseKind;
  position: number;
  targetSets: number;
  /** Target reps for weighted/reps kinds. */
  targetReps: number;
  targetRepsMax: number | null;
  /** Target hold in seconds for the time kind (null otherwise). */
  targetDurationSec: number | null;
  restSec: number | null;
  note: string | null;
  supersetGroup: string | null;
  section: string | null;
}

export interface ProgramDay {
  id: string;
  name: string;
  /** Position in the rotation (0-based). "Next up" = the day after the last session's. */
  position: number;
  warmup: string | null;
  cooldown: string | null;
  exercises: ProgramExercise[];
  /** Past sessions logged against this day — the stakes shown before deleting it. */
  sessionCount: number;
}

export interface Program {
  id: string;
  name: string;
  isActive: boolean;
  days: ProgramDay[];
}

export interface CreateProgramBody {
  name: string;
}
export interface UpdateProgramBody {
  name?: string;
}
export interface CreateDayBody {
  name: string;
}
export interface UpdateDayBody {
  name?: string;
  warmup?: string | null;
  cooldown?: string | null;
}
export interface AddDayExerciseBody {
  exerciseId: string;
  targetSets?: number;
  targetReps?: number;
  targetRepsMax?: number | null;
  targetDurationSec?: number | null;
  restSec?: number | null;
  note?: string | null;
  supersetGroup?: string | null;
  section?: string | null;
}
export interface UpdateDayExerciseBody {
  targetSets?: number;
  targetReps?: number;
  targetRepsMax?: number | null;
  targetDurationSec?: number | null;
  restSec?: number | null;
  note?: string | null;
  supersetGroup?: string | null;
  section?: string | null;
  position?: number;
}
/** New order of day ids, or of exercise ids within a day. */
export interface ReorderBody {
  order: string[];
}

// ---------------------------------------------------------------------------
// Sessions + logged sets
// ---------------------------------------------------------------------------

export interface SetLog {
  id: string;
  exerciseId: string;
  setNumber: number;
  /** Pounds — used by the weighted kind (0 for others). */
  weight: number;
  /** Reps — used by weighted/reps kinds (0 for time). */
  reps: number;
  /** Seconds — used by the time kind (0 for others). */
  durationSec: number;
  isWarmup: boolean;
  completedAt: string;
}

export interface SessionExercise {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  fromProgram: boolean;
  sets: SetLog[];
}

export interface SessionDetail {
  id: string;
  dayId: string | null;
  dayName: string | null;
  performedAt: string;
  note: string | null;
  exercises: SessionExercise[];
  records?: ExerciseRecords[];
}

export type PrKind = "est1rm" | "weight" | "volume" | "reps" | "duration";

export interface PrEntry {
  kind: PrKind;
  value: number;
  setId: string;
  weight: number;
  reps: number;
  durationSec: number;
  achievedAt: string;
}

export interface ExerciseRecords {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  records: PrEntry[];
}

export interface LoggedSetResult {
  set: SetLog;
  prs: PrKind[];
}

export interface StartSessionBody {
  /** Omit to start the next-up rotation day; pass a dayId to override. */
  dayId?: string | null;
}
export interface LogSetBody {
  exerciseId: string;
  setNumber: number;
  /** Send the fields relevant to the exercise's kind; the rest default to 0. */
  weight?: number;
  reps?: number;
  durationSec?: number;
  isWarmup?: boolean;
}
export interface UpdateSetBody {
  weight?: number;
  reps?: number;
  durationSec?: number;
  isWarmup?: boolean;
}

/** One exercise on today's session, with last-session numbers pre-filled. */
export interface TodayExercise {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  fromProgram: boolean;
  targetSets: number;
  targetReps: number;
  targetRepsMax: number | null;
  targetDurationSec: number | null;
  restSec: number | null;
  note: string | null;
  supersetGroup: string | null;
  section: string | null;
  /** From the most recent logged set of this exercise, or null if never done. */
  lastWeight: number | null;
  lastReps: number | null;
  lastDurationSec: number | null;
  /** Sets already logged in the in-progress session. */
  loggedSets: SetLog[];
}

/** The Today screen payload: next-up day + per-exercise history + any live session. */
export interface TodayResponse {
  day: { id: string; name: string; position: number; warmup: string | null; cooldown: string | null } | null;
  session: { id: string; performedAt: string } | null;
  exercises: TodayExercise[];
}

// ---------------------------------------------------------------------------
// Fuel (protein / calorie targets)
// ---------------------------------------------------------------------------

export interface FuelEntry {
  id: string;
  label: string;
  proteinG: number;
  calories: number;
  loggedAt: string;
}

export interface NutritionTarget {
  proteinG: number;
  calories: number;
}

/**
 * A label the user logs often, with the portion from their most recent entry for
 * it. Derived from their own entries only — this is not a food catalog.
 */
export interface FrequentFuel {
  label: string;
  proteinG: number;
  calories: number;
}

export interface FuelDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  target: NutritionTarget;
  entries: FuelEntry[];
  totals: { proteinG: number; calories: number };
  /** Most-logged labels first, for one-tap re-adding. */
  frequent: FrequentFuel[];
}

/** One day of the adherence window. Zero-filled for days with nothing logged. */
export interface FuelHistoryDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  proteinG: number;
  calories: number;
  /** Entries logged that day — 0 means nothing was logged, not "logged 0 g". */
  entryCount: number;
}

/** Daily totals over the last N days — powers the adherence chart. */
export interface FuelHistory {
  target: NutritionTarget;
  days: FuelHistoryDay[];
}

export interface AddFuelEntryBody {
  label: string;
  proteinG: number;
  calories: number;
}

// ---------------------------------------------------------------------------
// Body metrics + trends
// ---------------------------------------------------------------------------

export type BodyMetricKind = "weight" | "resting_hr" | "sleep_hours" | "body_fat";

export interface BodyMetric {
  id: string;
  kind: BodyMetricKind;
  value: number;
  measuredAt: string;
}

export interface AddBodyMetricBody {
  kind: BodyMetricKind;
  value: number;
  measuredAt?: string;
}

/** A single point on a trend line. */
export interface TrendPoint {
  /** ISO date the point is anchored to. */
  date: string;
  value: number;
}

/** What a progress trend measures, chosen by the exercise's kind. */
export type ProgressMetric = "est1rm" | "reps" | "time";

/** Progress over time for one exercise — best set per session, metric by kind. */
export interface ProgressTrend {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  metric: ProgressMetric;
  /** Display unit for the values: "lb" | "reps" | "s". */
  unit: string;
  points: TrendPoint[];
}

/** Item in the trends exercise picker. */
export interface TrendExercise {
  id: string;
  name: string;
  kind: ExerciseKind;
}
