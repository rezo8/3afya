/**
 * Shared API contract types between the afya backend (apps/api) and web (apps/web).
 * Keep this dependency-free — it is consumed as raw TypeScript source by both apps.
 *
 * Model summary (all rows are user-scoped):
 *  - Exercises are a shared library, reused across program days.
 *  - Each exercise has a measurement KIND that decides what a set records:
 *      weighted → weight (lb) × reps   (bench press)
 *      reps     → reps / count only    (pull-ups, soccer drills)
 *      time     → duration in seconds  (planks, timed holds, yoga)
 *      distance → distance + unit, and optionally a duration (runs, bike rides)
 *  - A program is a set of named days in a rotation order (not weekday-pinned).
 *  - A session need not belong to a program day at all: a FREEFORM session has a
 *    null dayId and holds whatever was actually done that day.
 *  - A day holds ordered exercises with targets (sets × reps, or sets × time).
 *    No planned weight — working weight lives in logged sets and "today"
 *    pre-fills it from the last session.
 *  - Fuel is logged per entry against a daily target: protein and calories always, carbs and fat optionally.
 */

/** Standard JSON error body returned by the API. */
export interface ApiErrorBody {
  error: string;
  message?: string;
}

/** How an exercise is measured — decides which fields a set records. */
export type ExerciseKind = "weighted" | "reps" | "time" | "distance";

/**
 * The unit a distance set was entered in. Stored per set rather than converted on
 * the way in, so a ride logged in miles still reads back as the miles that were
 * ridden. Comparisons (records, trends) normalize to metres; display does not.
 */
export type DistanceUnit = "mi" | "km" | "m";

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
 * A curated exercise the app knows the taxonomy of, whether or not the user owns it.
 * Served by `GET /api/exercises/catalog` so a picker can offer names beyond the
 * user's own library; picking one creates the library row, tagged from this entry.
 */
export interface CatalogExercise {
  name: string;
  kind: ExerciseKind;
  primaryMuscleGroup: MuscleGroup;
  equipment: Equipment;
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
  /** Swap which exercise this slot trains, keeping its position, targets and tags. */
  exerciseId?: string;
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
  /** Seconds — used by the time kind, and optionally by distance (0 for others). */
  durationSec: number;
  /** Distance in `distanceUnit` — used by the distance kind (0 for others). */
  distance: number;
  /** The unit `distance` was entered in; null on every set that records no distance. */
  distanceUnit: DistanceUnit | null;
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

export type PrKind = "est1rm" | "weight" | "volume" | "reps" | "duration" | "distance";

export interface PrEntry {
  kind: PrKind;
  /** The winning score. For the distance kind this is metres, so two units compare. */
  value: number;
  setId: string;
  weight: number;
  reps: number;
  durationSec: number;
  distance: number;
  distanceUnit: DistanceUnit | null;
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
  /** Start a session belonging to no program day at all. Ignored when `dayId` is set. */
  freeform?: boolean;
}
export interface LogSetBody {
  exerciseId: string;
  setNumber: number;
  /** Send the fields relevant to the exercise's kind; the rest default to 0. */
  weight?: number;
  reps?: number;
  durationSec?: number;
  distance?: number;
  distanceUnit?: DistanceUnit;
  isWarmup?: boolean;
  /**
   * Identifies one set-completion, so the same one arriving twice — a double tap, or a
   * retried request whose first response never came back — logs one row. Optional: a
   * client that sends none gets the old unguarded insert.
   */
  idempotencyKey?: string;
}

/**
 * The longest `LogSetBody.idempotencyKey` the API will honour. A longer one is treated
 * as keyless, which silently switches off the double-log guard — so the bound lives
 * here, where the client generating keys and the server validating them read the same
 * number, rather than once on each side.
 */
export const IDEMPOTENCY_KEY_MAX = 128;
export interface UpdateSetBody {
  weight?: number;
  reps?: number;
  durationSec?: number;
  distance?: number;
  distanceUnit?: DistanceUnit;
  isWarmup?: boolean;
}

/** One exercise on today's session, with what the previous session did for it. */
export interface TodayExercise {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  fromProgram: boolean;
  /** The program slot this exercise fills, and the handle a swap substitutes against. Null for ad-hoc. */
  programExerciseId: string | null;
  /** The planned exercise this one was swapped in for, by name. Null unless it is a substitute. */
  substitutedFor: string | null;
  targetSets: number;
  targetReps: number;
  targetRepsMax: number | null;
  targetDurationSec: number | null;
  restSec: number | null;
  note: string | null;
  supersetGroup: string | null;
  section: string | null;
  /**
   * The working sets of the most recent other session that logged this exercise, in set
   * order, warm-ups excluded. Empty if it has never been done. A set is compared against
   * the one at its own position here, not against whichever set happened to be last.
   */
  previousWorkingSets: SetLog[];
  /** Sets already logged in the in-progress session. */
  loggedSets: SetLog[];
}

/**
 * The session screen payload: a program day + per-exercise history + any live session.
 * `day` is null for a freeform session, where every exercise is ad-hoc.
 */
/** Swap a program slot for another exercise, for this session only. Same exercise = undo. */
export interface SubstituteBody {
  programExerciseId: string;
  exerciseId: string;
}

export interface TodayResponse {
  day: { id: string; name: string; position: number; warmup: string | null; cooldown: string | null } | null;
  session: { id: string; performedAt: string } | null;
  exercises: TodayExercise[];
}

// ---------------------------------------------------------------------------
// Fuel (protein, calories, carbs, fat)
// ---------------------------------------------------------------------------

/**
 * Grams of a macro an entry may leave out. `null` is "not given", never zero: most labels
 * print protein and calories, and a carb count guessed as 0 would lie in every total.
 */
export type OptionalGrams = number | null;

/** The four numbers a food carries. Protein and calories store a blank as 0; carbs and fat keep it null. */
export interface FuelMacros {
  proteinG: number;
  calories: number;
  carbsG: OptionalGrams;
  fatG: OptionalGrams;
}

export interface FuelEntry extends FuelMacros {
  id: string;
  label: string;
  /** Servings of a quick-add this entry is (0.5, 2); null for anything typed by hand. */
  portion: number | null;
  /** The saved food it was logged from, or null. */
  itemId: string | null;
  loggedAt: string;
}

/** Protein and calories are always aimed at. Carbs and fat have no target until one is set (null). */
export interface NutritionTarget {
  proteinG: number;
  calories: number;
  carbsG: number | null;
  fatG: number | null;
}

/** Energy stored in a pound of body mass, the usual working figure. Body weight is logged in lb. */
export const ENERGY_PER_LB = 3500;

/**
 * Energy expenditure estimated from what the user ate and what their weight did, never from
 * a formula of age and height. An estimate is only offered once there is enough of both to
 * mean something; until then, the reasons say what is missing.
 */
export type Expenditure =
  | { state: "insufficient"; reasons: string[]; loggedDays: number; weighIns: number; windowDays: number }
  | {
      state: "estimate";
      kcalPerDay: number;
      confidence: "low" | "moderate" | "good";
      /** Average calories over the days that were logged. */
      intakePerDay: number;
      /** Weight trend over the window, in lb per week. */
      trendLbPerWeek: number;
      loggedDays: number;
      weighIns: number;
      windowDays: number;
    };

/** A stretch of days one target applied to. `to` is null for the target in force now. */
export interface TargetPeriod {
  from: string;
  to: string | null;
  target: NutritionTarget;
}

/**
 * A label the user logs often, with the portion from their most recent entry for
 * it. Derived from their own entries only — this is not a food catalog.
 */
export interface FrequentFuel extends FuelMacros {
  label: string;
}

/**
 * A saved food: the user's own label, the unit they think in ("1 scoop", "100 g"), and one
 * unit's numbers. Not looked up anywhere; only what the user entered.
 */
export interface FuelItem extends FuelMacros {
  id: string;
  label: string;
  unit: string;
  /** Entries logged from this food, for ordering by how often it is used. */
  timesLogged: number;
}

export interface SaveFuelItemBody extends FuelMacros {
  label: string;
  unit: string;
}

/** The Foods screen: saved foods, and labels typed often enough to be worth saving. */
export interface FuelItems {
  items: FuelItem[];
  unsaved: FrequentFuel[];
}

/**
 * A one-tap chip. Saved foods come first and log one unit; after them, labels the user
 * types often, at their newest serving, for anything not saved yet.
 */
export type QuickAddFood =
  | (FuelMacros & { source: "item"; itemId: string; label: string; unit: string })
  | (FuelMacros & { source: "frequent"; label: string });

/** A day's sum of a macro some entries may not have given, and how many did not. */
export interface PartialTotal {
  grams: number;
  entriesWithout: number;
}

export interface FuelDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  target: NutritionTarget;
  entries: FuelEntry[];
  totals: { proteinG: number; calories: number; carbs: PartialTotal; fat: PartialTotal };
  /** Saved foods by use, then frequently typed labels not yet saved. */
  quickAdds: QuickAddFood[];
}

/** One day of the adherence window. Zero-filled for days with nothing logged. */
export interface FuelHistoryDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  proteinG: number;
  calories: number;
  /** Entries logged that day — 0 means nothing was logged, not "logged 0 g". */
  entryCount: number;
  /** The target in force that day, which is what the day is scored against — not today's. */
  target: NutritionTarget;
}

/** Daily totals over the last N days — powers the adherence chart and the Fuel week. */
export interface FuelHistory {
  /** The target now. */
  target: NutritionTarget;
  days: FuelHistoryDay[];
}

/**
 * How far back fuel can be logged or moved, in calendar days before today. Shared so the
 * day stepper stops exactly where the API would start refusing.
 */
export const FUEL_BACKDATE_DAYS = 30;

export interface AddFuelEntryBody extends FuelMacros {
  label: string;
  /**
   * Servings of a quick-add, when the numbers are that many of one serving. Omit for a
   * hand-typed entry. On PATCH, omitting it clears it: numbers typed over a portion are no
   * longer a multiple of anything.
   */
  portion?: number | null;
  /** The saved food this was logged from. Its numbers are still sent; the link is for counting. Read on POST only. */
  itemId?: string | null;
  /** When it was eaten, ISO 8601. Omit for now. No later than now, no earlier than FUEL_BACKDATE_DAYS back. */
  loggedAt?: string;
}
/**
 * Correcting an entry replaces its label and numbers. `loggedAt` moves it when given and
 * is kept when omitted, since the food was still eaten when it was logged.
 */
export type UpdateFuelEntryBody = AddFuelEntryBody;

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
export type ProgressMetric = "est1rm" | "reps" | "time" | "distance";

/** Progress over time for one exercise — best set per session, metric by kind. */
export interface ProgressTrend {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  metric: ProgressMetric;
  /** Display unit for the values: "lb" | "reps" | "s" | a DistanceUnit. */
  unit: string;
  points: TrendPoint[];
}

/** Item in the trends exercise picker. */
export interface TrendExercise {
  id: string;
  name: string;
  kind: ExerciseKind;
}
