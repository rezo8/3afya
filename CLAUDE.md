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
- **An exercise's `primaryMuscleGroup` / `equipment` come from the curated catalog
  in `apps/api/src/db/exercise-catalog.ts`, or they stay null.** Both columns are
  nullable and there is deliberately no UI or API to set them by hand.
  `POST /api/exercises` calls `findCatalogExercise(name)` — an **exact,
  case-insensitive** lookup on the trimmed name, **never fuzzy, not now and not
  later** — and stamps the match's tags onto the new row. A name the catalog
  doesn't list verbatim ("Incline DB Press", "Sandbag Zercher Carry") is left
  untagged, because a wrong tag would silently misattribute muscle volume and
  suggest nonsense swaps with nothing in the UI to expose the error, whereas a
  null degrades honestly (`/alternatives` returns `[]`). The catalog also supplies
  `kind` — but only as a fallback: `parseKind(body.kind) ?? catalogEntry.kind ??
  "weighted"`, so an explicit caller kind always wins.
  - The tags are stamped **on create only**. The resurrect and existing-row
    branches don't re-tag, and rows that predate the columns were tagged once by
    `drizzle/0010_backfill_exercise_tags.sql` — a materialized `UPDATE ... FROM
    (VALUES ...)` snapshot of the catalog's (lower name → group, equipment) pairs,
    guarded by `primary_muscle_group IS NULL` so it only fills gaps. **The
    migration and the constant must never disagree about what a name means**; the
    VALUES list was printed from the constant, not typed. Adding a catalog entry
    later tags exercises created from then on but does *not* retroactively tag one
    a user already has under that name — that needs its own new backfill
    migration.
- **`GET /api/exercises/:id/alternatives` ranks different equipment first.**
  Substitutes are the user's own non-archived same-muscle exercises (`inLibrary:
  true`) followed by catalog entries of that group whose names the library doesn't
  already hold, case-insensitively (`inLibrary: false, id: null` — adding it is
  the client's next step). Ordering lives in the pure `rankAlternatives`
  (`apps/api/src/exercise-alternatives.ts`, unit-tested): library half before
  catalog half, and within each half **different-`equipment` before
  same-`equipment`**, alphabetical on ties, capped at `ALTERNATIVES_LIMIT` (12).
  That equipment rule is the whole point — you look for a substitute because the
  machine is taken, so another exercise on that same machine is no help. An
  untagged source exercise returns `[]` rather than a guess. The handler fetches
  the user's whole active library in one query (tens of rows) and filters in JS,
  since it needs both the same-muscle candidates and the full name set.
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
- **A session snapshots its day's name in `workoutSession.dayName`.** `dayId`
  is `onDelete: "set null"`, so before this column existed, deleting a program
  day permanently degraded every past session that referenced it to "Freeform"
  in History — the template's mutability rewrote the record. `POST
  /api/sessions` sets `dayName` at **both** creation sites (the explicit-`dayId`
  branch and the rotation branch), and both read paths (`GET /` and `GET /:id`)
  resolve the name as **stored snapshot → live `programDay` join → null**. The
  live join is only a fallback for rows written before the snapshot existed
  (`0008_backfill_session_day_names.sql` backfilled the ones still pointing at a
  live day; ones already orphaned stay null — their names are unrecoverable).
  Keep that precedence order: reading the join first would re-break history on
  a rename. If you add another session-creation path, snapshot the name there
  too.
- **A session with zero sets is a real state, and it must never advance the
  rotation.** The row is created lazily on the first "Complete set" tap, so a
  failed set-POST leaves an empty session behind. `rotationState`
  (`apps/api/src/routes/sessions.ts`) therefore runs **two** latest-session
  queries, and the distinction is load-bearing: the *today* check
  (`latestSession`) takes the newest session of any kind, because a
  legitimately just-started session has zero sets for the moment between
  creation and its first set landing and filtering it would break resume;
  the *next-up* pick (`latestSessionWithSets`, "the day after the last
  session") inner-joins `set_log`, so an empty session can't silently advance
  the rotation past a day that was never trained. Don't collapse the two.
- **`DELETE /api/sessions/:id` exists only for those empty sessions** — it
  refuses with 400 (`Sessions with logged sets can't be deleted.`) as soon as
  the session has any `set_log` row. That is not a hole in "sessions are
  immutable records": an empty session has no performed content to protect.
- **`POST /api/sessions` is find-or-create per (day, calendar day)** via
  `todaySessionForDay` — a second POST with the same `dayId` returns the
  existing row with 200 rather than inserting (verified: 201 then 200, one
  row). So a retried create can't multiply empty sessions server-side. It is
  still a read-then-insert with no unique index, so it's not a concurrency
  guarantee — clients shouldn't lean on it as one.
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
- **`nutritionTarget` is an append-only log, not a mutable row.** `PUT
  /api/fuel/target` INSERTs; nothing ever updates or upserts it. `targetFor()`
  (`apps/api/src/routes/fuel.ts`) reads the current target as the newest row by
  `createdAt`, falling back to `DEFAULT_TARGET` when a user has none. The point
  is that editing a target must not rewrite the past: `GET /history` still
  applies today's target to every day in the window, and fixing that to score
  each day against the target in force *then* is only possible because the old
  rows survive. Don't reintroduce an upsert or a per-user unique constraint.
- **Frequent fuel labels are derived from the user's own entries, full stop.**
  `frequentFor()` groups `fuel_entry` on `lower(trim(label))` — exact match
  only, no food catalog and no fuzzy matching — and returns each group's
  newest label casing plus its newest portion (a re-weighed portion should win
  over an average of stale ones). It rides along on `GET /today` rather than a
  separate endpoint because the Fuel panel already fetches that query.
- The **contract** (`@afya/shared`) is the single source of truth for
  request/response shapes.

## Web shape

- Code-based routes (`apps/web/src/router.tsx`): `/` Today · `/session/$dayId`
  · `/program` · `/trends` · `/history` · `/history/$sessionId` · `/body`.
  Auth pages: `/sign-in`, `/sign-up`.
- Design direction is **"Vitality"** — a warm, dark, mobile-first world with
  an espresso ground and a marigold accent; the working-set number is the
  signature. Keep that restraint; don't add competing accents.
- **The app's one React Context is the rest timer**
  (`apps/web/src/screens/session/RestTimer.tsx`): `RestTimerProvider` +
  `useRestTimer()` are colocated in the same file as the private
  `useRestTimerState()` hook they wrap and the presentational `RestBar`. It's
  mounted once in `apps/web/src/app/AppLayout.tsx` (the pathless layout route
  wrapping every authenticated screen) rather than in `SessionScreen`, so the
  countdown — and its chime/vibration completion — survives navigating to
  another tab instead of being destroyed when `SessionScreen` unmounts.
  `AppLayout` itself has to be split into an outer `AppLayout` (mounts
  `RestTimerProvider`) and an inner `AppShell` (calls `useRestTimer()` and
  renders `RestBar`), since a component can't consume a context it provides
  in the same render pass — follow that same outer-provider/inner-consumer
  split for any future context that needs to live at the shell level.
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
- **Sets past the plan are loggable, and they pin focus.** A program exercise
  at/beyond `targetSets` keeps its numbers block, pips and Complete-set button
  live (eyebrow reads `Extra · set N`; the beyond-plan pips carry
  `.pip.extra`). `completeSet()` tests `loggedSets.length >= targetSets`
  **before** the `willBeDone`/superset branches and re-pins `override` on the
  same exercise, so an extra set never advances focus — not even for a
  superset member, since `pickNextInGroup`'s alternation is for plan sets and
  an extra set is a deliberate choice to stay put. `isExerciseDone`,
  `doneCount` and the progress track keep meaning "hit the plan", so a row
  legitimately reads 5/4.
- **`SessionScreen` remembers the session it lazily created.** `logSet`'s
  `mutationFn` resolves the session as `data?.session?.id ??
  createdSessionId.current`, and stores the id of any session it creates in
  that ref, because a failed set-POST doesn't invalidate — without the ref a
  retry re-reads the same still-empty `data.session` and issues another create
  round-trip. The ref is cleared in `logSet`'s `onSuccess` (invalidation
  repopulates `data.session`) and in the `dayId`-reset effect.
- **`isExerciseDone` (`apps/web/src/lib/session.ts`) is the one done
  predicate**, shared by `SessionScreen` (focus, counts, row ticks) and
  `StartScreen` (the day cards' Resume/Done states). Ad-hoc exercises are
  never done (`fromProgram &&`). Don't re-inline it in a screen — the point of
  the extraction is that the two screens can't disagree about where a day
  stands.
- **`StartScreen` owns advancing "next up" past a finished day.** The API's
  `rotationState` keeps returning *today's* day until tomorrow, so the client
  badges that day `DONE ✓` and moves `NEXT UP` to the following day in
  `program.days` itself (see the comment there). If rotation ever advances
  server-side, delete the client rule rather than letting both advance.
- **`FuelPanel`'s quick-add chips are the user's own `frequent` labels.** The
  four hardcoded `COLD_START_CHIPS` in `apps/web/src/screens/start/FuelPanel.tsx`
  are a cold-start fallback for when `FuelDay.frequent` is empty, not a default
  menu — anything else is logged through the panel's collapsed free-text form
  (name + protein/calorie steppers), which reuses the same `POST /api/fuel`
  mutation. Target editing hangs off the `targets · today` caption and **must
  invalidate both `["fuel","today"]` and `["fuel","history"]`**: `TrendsScreen`'s
  adherence chart grades its 7 days against `FuelHistory.target`, so invalidating
  only `today` leaves that chart scoring against the target you just replaced.
- **A day letter is its index in `program.days`, never `programDay.position`.**
  `position` is rotation order and is *not* re-packed when a day is deleted, so
  it outruns the array and disagrees with the letters on Start/Program (both
  `String.fromCharCode(65 + i)` over the rendered array). `SessionScreen`'s
  header deliberately shows **no** letter at all — the day's name is already
  its H1 — rather than deriving one from `position`. Don't reintroduce a
  position-derived letter anywhere.
- **"Delete day" is a two-step armed confirm that states the stakes.**
  `ProgramScreen` holds `armedDeleteDayId`; the first tap arms it for
  `DELETE_ARM_MS` (4s) and swaps the label for `Tap again to delete "<day>" · N
  sessions keep their name`, the second tap within the window deletes.
  Switching day chips disarms it. The count comes from `ProgramDay.sessionCount`
  (added to the payload `ProgramScreen` already fetches via one grouped
  `sessionCountsByDay` query in `apps/api/src/routes/programs.ts` — not a query
  per day). The copy can promise the name survives only because of the
  `dayName` snapshot above; if that ever regresses, this copy becomes a lie.
- **The recap is the session's ending, and it never locks.**
  `/history/$sessionId` (`SessionDetailScreen`) is the post-workout recap;
  `SessionScreen` links to it with `Review session ›` — a quiet
  `.review-session` link at the bottom while logging, and the primary action
  in the all-done card. Keep that wording: "Finish"/"Close" would lie, since
  sets can still be logged (and edited) after.
- **Zero-set sessions stay visible in History; only the stats exclude them.**
  `HistoryScreen` renders such a row with a muted `started · nothing logged`
  (`.ssum.untrained`) in place of the summary rather than filtering it out —
  explicit visibility beats silently hiding a row the user created — while the
  streak, the sessions-this-month count, the month volume and the calendar dots
  all derive from `sessions.filter(wasTrained)`. The way out of the dead end
  lives on `SessionDetailScreen`: its empty state carries a `Remove this
  session` armed confirm (the same `DELETE_ARM_MS` two-tap shape as
  `ProgramScreen`'s delete-day) wired to `DELETE /api/sessions/:id`, which
  navigates back to `/history` and invalidates `["sessions"]`, `["session"]`
  **and** `["today"]` — the last two matter because removing a session changes
  next-up and would otherwise leave a cached `SessionScreen` posting sets into
  a row that no longer exists.
- **The warm-up toggle is per-set UI state, not derived**: `SessionScreen.tsx`
  keeps a standalone `nextIsWarmup` boolean (not part of `Work`, which is
  keyed per-exercise and intentionally persists) and resets it to `false` in
  three places — `logSet`'s `onSuccess`, the `dayId`-reset effect, and
  `focusExercise` (a thin wrapper around `setOverride` used everywhere the
  user manually switches the active exercise: row taps, `addExercise`) — so a
  warm-up mark never silently carries over onto a different set. Follow the
  same `focusExercise` wrapper for any future per-set UI state that shouldn't
  survive an exercise switch.
- **`TrendsScreen` leads with the answer, not the trophy case.** Card order is
  Progress (per-exercise chart + lift picker) → Fuel adherence → Records, and
  Records is collapsed to the 3 newest `PrEntry`s across all exercises (ranked
  by `achievedAt`) behind a `See all records` toggle. The wall of 24+
  alphabetical exercises used to occupy ~70% of a ~4000px page and bury the
  chart 3.6 screens down; don't restore Records to the top or un-collapse it.
- **`GET /api/trends/exercises` is ordered by recency, and the picker depends
  on that order.** The SQL is `order by max(set_log.completed_at) desc,
  exercise.name asc`, and `TrendsScreen` takes `data[0]` as the default
  selected lift and renders the chips in array order (capped at 8 behind a
  `+N more` chip, with the selected chip pinned first). `TrendExercise` carries
  no timestamp — recency lives *only* in the array order, so reverting the
  route to `asc(exercise.name)` would silently make the chart default to
  whatever is alphabetically first again.
- **Un-logged fuel days are `null`, not `0`.** `FuelHistoryDay.entryCount === 0`
  is the only way to tell "didn't log" from "ate 0 g", and it must stay that
  way. `BarChart` accepts `(number | null)[]` where `null` draws a dashed
  hollow placeholder at the baseline (a real `0` is a solid 2px sliver), and the
  adherence readout counts logged days only — `"4 of 6 logged days on target"`,
  or `"no days logged"` when the window is empty. Scoring un-logged days as
  misses is what made the card read `0/7 days on target` against real data.
- **Both charts scrub by pointer position, not per-mark hover.** `LineChart` and
  `BarChart` each derive the hovered index from `clientX` in a shared
  `move(clientX)` and wire `onMouseMove`/`onMouseLeave` +
  `onTouchStart`/`onTouchMove`/`onTouchEnd` on the `<svg>` itself. `BarChart`'s
  old per-`<rect>` `onMouseEnter` had no touch path at all, so its readout never
  worked on the phone viewport this app targets — don't reintroduce per-mark
  mouse handlers. The readout clears on touch end (press-and-hold to read), and
  `svg.chart`'s `touch-action: pan-y` keeps vertical page scroll alive.
- **`theme.css`'s bare `.ls`/`.ls.on`** (used by the lift-select chips in
  `TrendsScreen`/`ProgramScreen`, and the warm-up toggle chip in
  `SessionScreen`) is an unrelated naming coincidence next to the
  `ls-`-prefixed classes (`ls-num`, `ls-edit`, `ls-pr`, `ls-del`,
  `ls-warmup-btn`, `ls-warmup-tag`) scoped to the logged-set row in
  `SessionScreen`'s "Logged sets" list — the former is a generic single-toggle
  chip pattern, the latter is one specific component's internals. Don't
  assume they're related when grepping for `ls`.

## Conventions worth repeating

- DB changes: edit the Drizzle schema, then `db:generate` + `db:migrate`.
  Never hand-edit `apps/api/drizzle/`.
- **drizzle-kit cannot drop a Postgres primary key.** For an implicit
  column-level PK it emits a commented `DROP CONSTRAINT "<constraint_name>"`
  placeholder instead of SQL (`PgAlterTableAlterColumnDropPrimaryKeyConvertor`
  — it doesn't know the constraint's name), so the generated migration will not
  run as-is and no reshaping of the schema definition avoids it. The fix is a
  companion `drizzle-kit generate --custom` migration holding just the drop,
  ordered before the generated one — `--custom` copies the previous snapshot
  forward, so the pending diff survives for the next `db:generate`. See
  `apps/api/drizzle/0005_drop_nutrition_target_legacy_pk.sql` +
  `0006_neat_albert_cleary.sql`. Prefer this over editing generated SQL.
- **`--custom` is also how data backfills ship**, not just DDL drizzle-kit can't
  emit — see `0008_backfill_session_day_names.sql` and
  `0010_backfill_exercise_tags.sql`. A backfill whose values come from a TypeScript
  constant should be *printed* from that constant into the SQL (throwaway script),
  never retyped, and should be guarded so re-running it can't overwrite live data
  (`WHERE <col> IS NULL`).
- **A schema change that is breaking for `main` must not be migrated against
  the shared dev `afya` database.** Create a throwaway DB
  (`CREATE DATABASE afya_prN OWNER afya`), point `DATABASE_URL` at it, and run
  the API on a spare port; `AUTH_DATABASE_URL` can stay as-is since auth lives
  in mi7rab's DB. To rehearse the production upgrade, apply the *old*
  migrations first, insert rows that mirror prod, then apply the new ones and
  confirm the rows survived.
- Don't format/edit generated files (see the umbrella `.prettierignore`).
- The umbrella `.prettierrc` sets no `printWidth`, so `prettier --check` is red
  across the whole repo (the code is written at ~110 columns). Match the
  surrounding style; don't run `pnpm format` to "fix" it — that reformats
  everything.

## Testing

- **Vitest** is the API's test framework (`apps/api/package.json`'s `test`
  script — `vitest run`), first introduced alongside `records.ts`'s
  warm-up/working-set tests. No vitest config file exists or is needed: every
  tested module (`records.ts`, `exercise-alternatives.ts`,
  `db/exercise-catalog.ts`) imports from `@afya/shared` **type-only**, which is
  erased at compile time under `verbatimModuleSyntax`, so pure-logic modules
  like these need no cross-workspace runtime resolution. If a future test needs
  to import something with a runtime (not type-only) cross-package import,
  that will need real workspace module resolution set up — don't assume the
  no-config setup still works once that happens.
- Tests live beside the code they test (`records.test.ts` next to
  `records.ts`), matching the Go blueprint's convention even though this is
  the Node stack.
