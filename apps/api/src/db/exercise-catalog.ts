import type { Equipment, ExerciseKind, MuscleGroup } from "@afya/shared";

/**
 * The curated exercise taxonomy: the one place a name is mapped to a muscle group
 * and a piece of equipment.
 *
 * Two things read it:
 *   1. `POST /api/exercises` stamps a new row's tags when the name matches an entry.
 *   2. `GET /api/exercises/:id/alternatives` suggests same-muscle entries the user
 *      doesn't have yet.
 *
 * Matching is **exact and case-insensitive, never fuzzy** (see `findCatalogExercise`).
 * A wrong tag is worse than no tag: it would silently misattribute muscle volume and
 * suggest nonsense swaps, with nothing in the UI to reveal the mistake. Names the
 * catalog doesn't know stay untagged.
 *
 * `drizzle/0010_backfill_exercise_tags.sql` holds a materialized snapshot of the (lower
 * name → muscle group, equipment) pairs below, printed from this constant to tag rows
 * that predate the columns. Adding an entry here tags exercises created *from now on*
 * but does not retroactively tag one a user already has under that name — if that
 * matters, the entry needs its own new backfill migration. Never edit either side to
 * disagree with the other about what a name means.
 */
export interface CatalogExercise {
  name: string;
  kind: ExerciseKind;
  primaryMuscleGroup: MuscleGroup;
  equipment: Equipment;
}

export const EXERCISE_CATALOG: readonly CatalogExercise[] = [
  // --- chest ---------------------------------------------------------------
  { name: "Barbell Bench Press", kind: "weighted", primaryMuscleGroup: "chest", equipment: "barbell" },
  { name: "Dumbbell Bench Press", kind: "weighted", primaryMuscleGroup: "chest", equipment: "dumbbell" },
  { name: "Incline Dumbbell Press", kind: "weighted", primaryMuscleGroup: "chest", equipment: "dumbbell" },
  { name: "Machine Chest Press", kind: "weighted", primaryMuscleGroup: "chest", equipment: "machine" },
  { name: "Pec Deck", kind: "weighted", primaryMuscleGroup: "chest", equipment: "machine" },
  { name: "Cable Fly", kind: "weighted", primaryMuscleGroup: "chest", equipment: "cable" },
  { name: "Weighted Dip", kind: "weighted", primaryMuscleGroup: "chest", equipment: "bodyweight" },
  { name: "Push-Up", kind: "reps", primaryMuscleGroup: "chest", equipment: "bodyweight" },

  // --- back ----------------------------------------------------------------
  // Conventional deadlift sits here rather than under hamstrings: it's trained and
  // programmed as a heavy back/posterior pull. The RDL is the hamstring variant.
  { name: "Deadlift", kind: "weighted", primaryMuscleGroup: "back", equipment: "barbell" },
  { name: "Barbell Row", kind: "weighted", primaryMuscleGroup: "back", equipment: "barbell" },
  { name: "T-Bar Row", kind: "weighted", primaryMuscleGroup: "back", equipment: "barbell" },
  { name: "Chest-Supported Row", kind: "weighted", primaryMuscleGroup: "back", equipment: "machine" },
  { name: "Single-Arm Dumbbell Row", kind: "weighted", primaryMuscleGroup: "back", equipment: "dumbbell" },
  { name: "Seated Cable Row", kind: "weighted", primaryMuscleGroup: "back", equipment: "cable" },
  { name: "Lat Pulldown", kind: "weighted", primaryMuscleGroup: "back", equipment: "cable" },
  { name: "Pull-Up", kind: "reps", primaryMuscleGroup: "back", equipment: "bodyweight" },
  { name: "Chin-Up", kind: "reps", primaryMuscleGroup: "back", equipment: "bodyweight" },

  // --- shoulders -----------------------------------------------------------
  { name: "Overhead Press", kind: "weighted", primaryMuscleGroup: "shoulders", equipment: "barbell" },
  { name: "Arnold Press", kind: "weighted", primaryMuscleGroup: "shoulders", equipment: "dumbbell" },
  { name: "Machine Shoulder Press", kind: "weighted", primaryMuscleGroup: "shoulders", equipment: "machine" },
  { name: "Lateral Raise", kind: "weighted", primaryMuscleGroup: "shoulders", equipment: "dumbbell" },
  { name: "Cable Lateral Raise", kind: "weighted", primaryMuscleGroup: "shoulders", equipment: "cable" },
  { name: "Rear Delt Fly", kind: "weighted", primaryMuscleGroup: "shoulders", equipment: "dumbbell" },
  { name: "Face Pulls", kind: "weighted", primaryMuscleGroup: "shoulders", equipment: "cable" },
  { name: "Band Pull-Apart", kind: "reps", primaryMuscleGroup: "shoulders", equipment: "band" },

  // --- biceps --------------------------------------------------------------
  { name: "Barbell Curl", kind: "weighted", primaryMuscleGroup: "biceps", equipment: "barbell" },
  { name: "Hammer Curl", kind: "weighted", primaryMuscleGroup: "biceps", equipment: "dumbbell" },
  { name: "Incline Dumbbell Curl", kind: "weighted", primaryMuscleGroup: "biceps", equipment: "dumbbell" },
  { name: "Cable Curl", kind: "weighted", primaryMuscleGroup: "biceps", equipment: "cable" },
  { name: "Preacher Curl", kind: "weighted", primaryMuscleGroup: "biceps", equipment: "machine" },

  // --- triceps -------------------------------------------------------------
  { name: "Triceps Pushdown", kind: "weighted", primaryMuscleGroup: "triceps", equipment: "cable" },
  { name: "Overhead Triceps Extension", kind: "weighted", primaryMuscleGroup: "triceps", equipment: "dumbbell" },
  { name: "Skullcrusher", kind: "weighted", primaryMuscleGroup: "triceps", equipment: "barbell" },
  { name: "Machine Triceps Extension", kind: "weighted", primaryMuscleGroup: "triceps", equipment: "machine" },
  { name: "Bench Dip", kind: "reps", primaryMuscleGroup: "triceps", equipment: "bodyweight" },

  // --- forearms ------------------------------------------------------------
  { name: "Wrist Curl", kind: "weighted", primaryMuscleGroup: "forearms", equipment: "dumbbell" },
  { name: "Dead Hang", kind: "time", primaryMuscleGroup: "forearms", equipment: "bodyweight" },

  // --- quads ---------------------------------------------------------------
  { name: "Back Squat", kind: "weighted", primaryMuscleGroup: "quads", equipment: "barbell" },
  { name: "Front Squat", kind: "weighted", primaryMuscleGroup: "quads", equipment: "barbell" },
  { name: "Goblet Squat", kind: "weighted", primaryMuscleGroup: "quads", equipment: "kettlebell" },
  { name: "Hack Squat", kind: "weighted", primaryMuscleGroup: "quads", equipment: "machine" },
  { name: "Leg Press", kind: "weighted", primaryMuscleGroup: "quads", equipment: "machine" },
  { name: "Leg Extension", kind: "weighted", primaryMuscleGroup: "quads", equipment: "machine" },
  { name: "Bulgarian Split Squat", kind: "weighted", primaryMuscleGroup: "quads", equipment: "dumbbell" },
  { name: "Walking Lunge", kind: "weighted", primaryMuscleGroup: "quads", equipment: "dumbbell" },

  // --- hamstrings ----------------------------------------------------------
  { name: "Romanian Deadlift", kind: "weighted", primaryMuscleGroup: "hamstrings", equipment: "barbell" },
  { name: "Good Morning", kind: "weighted", primaryMuscleGroup: "hamstrings", equipment: "barbell" },
  { name: "Seated Hamstring Curl", kind: "weighted", primaryMuscleGroup: "hamstrings", equipment: "machine" },
  { name: "Lying Leg Curl", kind: "weighted", primaryMuscleGroup: "hamstrings", equipment: "machine" },
  { name: "Nordic Curl", kind: "reps", primaryMuscleGroup: "hamstrings", equipment: "bodyweight" },

  // --- glutes --------------------------------------------------------------
  { name: "Hip Thrust", kind: "weighted", primaryMuscleGroup: "glutes", equipment: "barbell" },
  { name: "Cable Kickback", kind: "weighted", primaryMuscleGroup: "glutes", equipment: "cable" },
  { name: "Glute Bridge", kind: "reps", primaryMuscleGroup: "glutes", equipment: "bodyweight" },

  // --- calves --------------------------------------------------------------
  { name: "Standing Calf Raise", kind: "weighted", primaryMuscleGroup: "calves", equipment: "machine" },
  { name: "Seated Calf Raise", kind: "weighted", primaryMuscleGroup: "calves", equipment: "machine" },
  { name: "Single-Leg Calf Raise", kind: "reps", primaryMuscleGroup: "calves", equipment: "bodyweight" },

  // --- core ----------------------------------------------------------------
  { name: "Plank", kind: "time", primaryMuscleGroup: "core", equipment: "bodyweight" },
  { name: "Side Plank", kind: "time", primaryMuscleGroup: "core", equipment: "bodyweight" },
  { name: "Hanging Knee Raise", kind: "reps", primaryMuscleGroup: "core", equipment: "bodyweight" },
  { name: "Ab Wheel Rollout", kind: "reps", primaryMuscleGroup: "core", equipment: "other" },
  { name: "Dead Bug", kind: "reps", primaryMuscleGroup: "core", equipment: "bodyweight" },
  { name: "Cable Crunch", kind: "weighted", primaryMuscleGroup: "core", equipment: "cable" },

  // --- full body -----------------------------------------------------------
  { name: "Farmer Carry", kind: "weighted", primaryMuscleGroup: "full_body", equipment: "dumbbell" },
  { name: "Kettlebell Swing", kind: "weighted", primaryMuscleGroup: "full_body", equipment: "kettlebell" },
  { name: "Burpee", kind: "reps", primaryMuscleGroup: "full_body", equipment: "bodyweight" },
];

const CATALOG_BY_LOWER_NAME = new Map(EXERCISE_CATALOG.map((entry) => [entry.name.toLowerCase(), entry]));

/**
 * Look up a catalog entry by name — exact match, case-insensitive, no fuzzy matching.
 * Returns null for anything the catalog doesn't list verbatim.
 */
export const findCatalogExercise = (name: string): CatalogExercise | null =>
  CATALOG_BY_LOWER_NAME.get(name.trim().toLowerCase()) ?? null;

export const catalogForMuscleGroup = (group: MuscleGroup): CatalogExercise[] =>
  EXERCISE_CATALOG.filter((entry) => entry.primaryMuscleGroup === group);
