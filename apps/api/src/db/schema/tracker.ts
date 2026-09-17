import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { BodyMetricKind, DistanceUnit, Equipment, ExerciseKind, MuscleGroup } from "@afya/shared";

/**
 * Tracker schema. Everything is user-scoped via a `user_id` FK to Better Auth's
 * `user` table. IDs on our own rows are UUIDs; `user_id` is text to match the
 * auth table's id type.
 *
 * Shape mirrors the settled model:
 *   exercise (library) ← program_exercise → program_day → program
 *   workout_session → set_log  (set_log.weight is the source of truth for the
 *   "last session" pre-fill and every strength trend)
 *   fuel_entry + nutrition_target, body_metric
 */

// --- Exercise library ------------------------------------------------------

export const exercise = pgTable(
  "exercise",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").$type<ExerciseKind>().default("weighted").notNull(),
    // Taxonomy stamped from the curated catalog (../exercise-catalog.ts) when the name
    // matches one of its entries, and null otherwise — a name we don't recognize stays
    // untagged rather than guessed at. Drives substitution suggestions and (eventually)
    // per-muscle volume.
    primaryMuscleGroup: text("primary_muscle_group").$type<MuscleGroup>(),
    equipment: text("equipment").$type<Equipment>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("exercise_user_name_idx").on(t.userId, t.name)],
);

// --- Program → days → exercises --------------------------------------------

export const program = pgTable(
  "program",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [index("program_user_idx").on(t.userId)],
);

export const programDay = pgTable(
  "program_day",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => program.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Rotation order (0-based). "Next up" = the day after the last session's day.
    position: integer("position").default(0).notNull(),
    warmup: text("warmup"),
    cooldown: text("cooldown"),
  },
  (t) => [index("program_day_program_idx").on(t.programId)],
);

export const programExercise = pgTable(
  "program_exercise",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => programDay.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
    targetSets: integer("target_sets").default(3).notNull(),
    targetReps: integer("target_reps").default(8).notNull(),
    targetRepsMax: integer("target_reps_max"),
    // Target hold in seconds for the "time" kind; null for weighted/reps.
    targetDurationSec: integer("target_duration_sec"),
    restSec: integer("rest_sec"),
    note: text("note"),
    supersetGroup: text("superset_group"),
    section: text("section"),
  },
  (t) => [index("program_exercise_day_idx").on(t.dayId)],
);

// --- Sessions + logged sets ------------------------------------------------

export const workoutSession = pgTable(
  "workout_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    // Nullable: a freeform session isn't tied to a program day, and we keep the
    // session if the day is later deleted.
    dayId: uuid("day_id").references(() => programDay.id, { onDelete: "set null" }),
    // Snapshot of the day's name at the time the session was created. A session is
    // a historical record: deleting or renaming the program day must not rewrite
    // what this workout was called. Null only for genuinely freeform sessions (and
    // for sessions orphaned before this column existed).
    dayName: text("day_name"),
    performedAt: timestamp("performed_at", { withTimezone: true }).defaultNow().notNull(),
    note: text("note"),
  },
  (t) => [index("session_user_performed_idx").on(t.userId, t.performedAt)],
);

export const setLog = pgTable(
  "set_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSession.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "restrict" }),
    setNumber: integer("set_number").notNull(),
    // Which fields matter depends on the exercise kind:
    //   weighted → weight + reps · reps → reps · time → durationSec
    //   distance → distance + distanceUnit, and durationSec when the user timed it
    weight: real("weight").default(0).notNull(),
    reps: integer("reps").default(0).notNull(),
    durationSec: integer("duration_sec").default(0).notNull(),
    distance: real("distance").default(0).notNull(),
    // Kept as entered rather than normalized: a 7-mile ride reads back in miles.
    // Records and trends convert to metres to compare across units.
    distanceUnit: text("distance_unit").$type<DistanceUnit>(),
    isWarmup: boolean("is_warmup").default(false).notNull(),
    // One set-completion's identity, supplied by the client. Nullable on purpose: every
    // row that predates this column, and every request that sends no key, still inserts.
    idempotencyKey: text("idempotency_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("set_log_session_idx").on(t.sessionId),
    // Drives the "last session" pre-fill and the per-exercise strength trends.
    index("set_log_exercise_completed_idx").on(t.exerciseId, t.completedAt),
    // What actually stops a double-logged set: a second insert carrying a key this
    // session already used is rejected by Postgres rather than by application code.
    // Postgres treats NULLs as distinct by default, so keyless inserts are unaffected.
    uniqueIndex("set_log_session_idem_idx").on(t.sessionId, t.idempotencyKey),
  ],
);

// --- Fuel (protein / calorie targets) --------------------------------------

export const fuelEntry = pgTable(
  "fuel_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    label: text("label").notNull(),
    proteinG: real("protein_g").default(0).notNull(),
    calories: integer("calories").default(0).notNull(),
    loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("fuel_entry_user_logged_idx").on(t.userId, t.loggedAt)],
);

/**
 * Append-only log of nutrition targets: one row per edit, never updated in place.
 * The user's current target is the newest row. Keeping every past target is what
 * lets historical adherence stay scored against the target that was actually in
 * force on that day.
 */
export const nutritionTarget = pgTable(
  "nutrition_target",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    proteinG: integer("protein_g").default(180).notNull(),
    calories: integer("calories").default(2600).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("nutrition_target_user_created_idx").on(t.userId, t.createdAt)],
);

// --- Body metrics ----------------------------------------------------------

export const bodyMetric = pgTable(
  "body_metric",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<BodyMetricKind>().notNull(),
    value: real("value").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("body_metric_user_kind_idx").on(t.userId, t.kind, t.measuredAt)],
);

// --- Relations (for convenient nested queries) -----------------------------

export const programRelations = relations(program, ({ many }) => ({
  days: many(programDay),
}));

export const programDayRelations = relations(programDay, ({ one, many }) => ({
  program: one(program, { fields: [programDay.programId], references: [program.id] }),
  exercises: many(programExercise),
}));

export const programExerciseRelations = relations(programExercise, ({ one }) => ({
  day: one(programDay, { fields: [programExercise.dayId], references: [programDay.id] }),
  exercise: one(exercise, { fields: [programExercise.exerciseId], references: [exercise.id] }),
}));

export const workoutSessionRelations = relations(workoutSession, ({ one, many }) => ({
  day: one(programDay, { fields: [workoutSession.dayId], references: [programDay.id] }),
  sets: many(setLog),
}));

export const setLogRelations = relations(setLog, ({ one }) => ({
  session: one(workoutSession, { fields: [setLog.sessionId], references: [workoutSession.id] }),
  exercise: one(exercise, { fields: [setLog.exerciseId], references: [exercise.id] }),
}));
