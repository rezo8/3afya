# CLAUDE.md — 3afya

عافية (3afya, "well-being, vitality") is a personal, self-hostable workout &
health tracker. It follows the shared blueprint in the umbrella
**[`../CLAUDE.md`](../CLAUDE.md)** ("Node apps" throughout) — read that for
the stack, code principles, and how-Claude-should-work rules. This file only
records what is specific to 3afya.

## App-specific

- **Scope:** `@afya/*` · **package manager:** pnpm · **Node:** 22.
- **Ports:** web **5174**, api **3001**, Postgres **5435**, Redis **6380**.
  Local DB name/user: `afya`.
- **Local dev:** `docker compose up -d` → `cp .env.example apps/api/.env`
  (set a real `BETTER_AUTH_SECRET`) → `pnpm install` → `pnpm --filter
  @afya/api db:migrate` (+ `db:seed` for a demo account) → `pnpm dev`. See the
  README for the full quickstart + demo login.
- **Deployed** (Cloud Run service `afya` in the `mi7rab` GCP project, on the
  shared-infra model — domain DB `afya` on the shared `mi7rab-db` instance,
  auth shared with mi7rab). Real serving URL is
  `https://afya-qjyft4sfwa-uc.a.run.app` (no custom domain mapped, despite an
  old placeholder `afya.ribhielzaru.com` — don't reintroduce that as
  `BETTER_AUTH_URL`/an exact `CORS_ORIGINS` value, it isn't real and will
  break login with Better Auth's "Invalid origin" error for anyone hitting
  the actual URL). Origin policy is intentionally wide open:
  `CORS_ORIGINS=*` in `cloudbuild.yaml` trusts any origin (CORS reflects the
  request's Origin in `index.ts`; Better Auth's own wildcard matching handles
  `trustedOrigins` natively). Known remaining prod gap: `deploy/setup.sh` may
  still provision a separate DB user instead of using the shared `mi7rab`
  role — check current state against the umbrella "Deployment" section
  rather than assuming it's resolved.

## Domain

Schema in `apps/api/src/db/schema/tracker.ts`. All rows are user-scoped.

- **Exercises** (`exercise`) are a shared library, reused across program
  days. Each has a measurement **kind** that decides what a set records:
  `weighted` (weight × reps), `reps` (count only), or `time` (duration).
- **Deleting an exercise never destroys set-log history.** `setLog.exerciseId`
  is `onDelete: "restrict"` (not `cascade`) precisely so this can't regress —
  Postgres itself refuses the delete if any sets reference the exercise.
  `DELETE /api/exercises/:id` (`apps/api/src/routes/exercises.ts`) checks for
  existing set logs first: none → hard delete; any → soft-delete by setting
  `exercise.archivedAt` instead, and returns `{ok:true}` either way. Archived
  exercises are hidden from `GET /api/exercises` and rejected by
  `POST /days/:dayId/exercises` (can't add one to a new program day), but the
  row and its history stay intact. Because `(userId, name)` is a unique
  index, `POST /api/exercises` with an archived exercise's exact name
  **resurrects** it (clears `archivedAt`, same id) rather than erroring —
  otherwise that name would be permanently unusable again. `programExercise`
  keeps `onDelete: "cascade"` deliberately — losing a program-day reference on
  delete is fine; losing historical training data is not.
- A **program** (`program` → `programDay` → `programExercise`) is a rotation
  of named days (not weekday-pinned) with target sets × reps/time — no
  planned weight. "Today" is the next day after your last session.
- A **workout session** (`workoutSession` → `setLog`) is a **snapshot of one
  day**, not a growing edit of the program template — logging a set never
  touches `programExercise`. An exercise belongs to a session iff it has ≥1
  logged set; there's deliberately **no session-exercise join table**. Ad-hoc
  exercises (not in the program day) are surfaced by `buildDayExercises`
  (`apps/api/src/routes/sessions.ts`), which appends exercises that have
  session sets but aren't in the program day, tagged `fromProgram: false`.
  This is intentional — don't "fix" it by adding a join table; it keeps
  sessions immutable records and programs reusable templates.
- **Fuel** (`fuelEntry`, `nutritionTarget`) is logged per entry against a
  daily protein/calorie target. **Body metrics** (`bodyMetric`, e.g. weight,
  resting HR, sleep) trend over time. Estimated 1RM uses the Epley formula on
  the best set per session.
- Every logged set is **`isWarmup: boolean` (default false)** on `setLog` — a
  simple flag, not a richer set-type enum (no dropset/failed-set concepts
  yet). `apps/api/src/records.ts` (`computeRecords`/`detectPrs`) filters
  warm-ups out **internally, once** — it takes the full set list and
  discards `isWarmup` sets itself, rather than expecting every call site to
  pre-filter. Every caller (session records, the standalone records route,
  the trends progress route) gets correct PR/trend behavior automatically as
  long as it includes `isWarmup` in its `RecordSet`-shaped query/object. If
  you add a new place that reads `set_log` into a `RecordSet` or a trend
  score, remember to select `isWarmup` — a query that omits it will silently
  treat every set as a working set.
- The **contract** (`@afya/shared`) is the single source of truth for
  request/response shapes.

## Web shape

- Code-based routes (`apps/web/src/router.tsx`): `/` Today · `/session/$dayId`
  · `/program` · `/trends` · `/history` · `/history/$sessionId` · `/body`.
  Auth pages: `/sign-in`, `/sign-up`.
- Design direction is **"Vitality"** — a warm, dark, mobile-first world with
  an espresso ground and a marigold accent; the working-set number is the
  signature. Keep that restraint; don't add competing accents.
- **`SessionScreen.tsx`'s active-exercise focus is derived, not stored**:
  `activeId` = the manually-tapped `override` if it's still a valid,
  incomplete exercise, else the first incomplete exercise in program order.
  `completeSet()` is the only thing that changes `override`, and it must stay
  pinned on the just-logged exercise until that exercise (or, for a
  superset — same `programExercise.supersetGroup` — *both* members of its
  group) is actually done; clearing `override` unconditionally after every
  set snaps focus back to list order and breaks logging out of order or
  supersets (this was a real bug, fixed once already — don't reintroduce it).
  Supersets alternate via `pickNextInGroup`, cycling to the next incomplete
  group member in program order rather than falling through to list order.

## Conventions worth repeating

- DB changes: edit the Drizzle schema, then `db:generate` + `db:migrate`.
  Never hand-edit `apps/api/drizzle/`.
- Don't format/edit generated files (see the umbrella `.prettierignore`).

## Testing

- **Vitest** is the API's test framework (`apps/api/package.json`'s `test`
  script — `vitest run`), first introduced alongside `records.ts`'s
  warm-up/working-set tests. No vitest config file exists or is needed:
  `records.ts` only has a type-only import from `@afya/shared`, which is
  erased at compile time under `verbatimModuleSyntax`, so pure-logic modules
  like it need no cross-workspace runtime resolution. If a future test needs
  to import something with a runtime (not type-only) cross-package import,
  that will need real workspace module resolution set up — don't assume the
  no-config setup still works once that happens.
- Tests live beside the code they test (`records.test.ts` next to
  `records.ts`), matching the Go blueprint's convention even though this is
  the Node stack.
