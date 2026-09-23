# PROJECT_RECOMMENDATIONS.md — 3afya

Synthesis of five independent audits (`PRODUCT_LEAD_AUDIT.md`, `DOMAIN_MODEL_AUDIT.json`,
`BACKEND_ENGINEERING_AUDIT.json`, `UX-AUDIT-active-workout.json`,
`product-strategy-audit.json`), cross-checked directly against the current code
in `apps/api` and `apps/web`. Every claim referenced below was re-verified by
reading the actual file at the cited path before being restated here; where an
audit's framing didn't hold up, that's called out explicitly in §11 rather than
silently repeated.

---

## 1. Executive Summary

3afya's domain model is unusually good for its size. The plan/performed split
(`program → programDay → programExercise` vs. `workoutSession → setLog`, with
no session-exercise join table) is a genuinely correct architectural call —
programs stay freely editable, sessions stay immutable records, and ad-hoc
exercises fold in cleanly. The rotation-based "today" (next day after your
last session, not weekday-pinned) correctly matches how people actually
train. The backend is small, consistently authenticated, and mostly free of
the kind of accidental complexity that makes codebases painful later.

But the application is currently **a strictly worse Hevy at the one moment
that matters most**: live logging. Two things it has already modeled and let
you configure — superset/section grouping and warm-up/working set
distinction — are invisible or ignored the instant you actually train, and a
handful of small, contained frontend bugs (an out-of-order-logging focus
bug, a rest timer that dies on tab switch, silent failure on every mutation)
turn ordinary gym behavior into repeated friction or, worse, silent data
loss. Underneath that, one real data-integrity landmine exists: deleting an
exercise from the library permanently and irreversibly deletes every set ever
logged against it, with no confirmation of scope and no undo.

The most important direction for the next stage is **not** more features. It
is: (1) fix the handful of cheap, contained bugs that make the existing core
loop untrustworthy or annoying, (2) stop the one real path to permanent data
loss, and (3) lay two foundation stones (exercise taxonomy, warm-up/working
distinction) that every future "smarter" feature depends on. Everything
else — AI coaching, wearables, food databases, multi-program UX — is either
premature or secondary to those three.

---

## 2. Product Thesis

3afya is a personal, self-hosted workout, nutrition, and body-metric tracker
for one disciplined user (per the umbrella `CLAUDE.md` — this is not a
funded multi-tenant product, and "moat"/"retention" language below means
"worth continuing to invest engineering time in for years," not "wins a
market"). It is not going to out-execute Hevy as a pure set-logger — Hevy has
a team, a device sync story, and years of exercise-library/UX polish that a
solo project won't match feature-for-feature.

**Why it should exist anyway:** it is the smallest possible closed-loop
personal training system, and it already has the one structural advantage a
single-domain competitor can't easily bolt on — training, nutrition
adherence, and recovery signals (sleep, resting HR, bodyweight) already live
under one account, in one schema. Hevy has no recovery tracking at all.
MyFitnessPal has no training awareness. 3afya has the raw ingredients for
"does last night's sleep and this week's eating change what today's session
should look like" — deterministically, explainably, with data it already
collects — and currently does none of that reasoning. That synthesis, not a
better exercise picker, is the actual reason to keep building this instead of
just using Hevy.

**Core user:** the developer themself — a disciplined, detail-oriented
lifter who trains consistently over months/years, will notice if a PR badge
or a trend line is quietly wrong, and wants the system to get quietly smarter
about their own training without turning into a subscription-driven app with
engagement mechanics aimed at someone else.

**Core problem:** turning "what I did" (sets, meals, sleep, bodyweight) into
"what I should do today" — using rules simple enough to explain in one
sentence, well before anything AI-flavored is justified.

---

## 3. Core Product Principles

1. **The active workout loop must minimize taps, typing, and navigation.**
   Every set logged is friction multiplied by every workout, forever — this
   is the highest-frequency surface in the app by a wide margin.
2. **Historical workouts must remain semantically accurate forever**, even
   after programs, exercise names, or catalogs change later. Nothing a user
   logged should silently reinterpret itself because of an unrelated edit
   made months afterward.
3. **The system may suggest, but the lifter always overrides.** Progression
   and readiness features propose a number; they never auto-pilot one in.
4. **Every write the user just performed must have a visible outcome.**
   Silence on a failed mutation is never acceptable, especially on the
   single highest-frequency write path (logging a set) in a gym with
   unreliable connectivity.
5. **A feature ships only if it improves logging, progression, understanding
   (analytics), or personalization** — not because a competitor has it.
6. **Cross-domain signal is the actual differentiator.** Training, fuel
   adherence, and recovery already live under one account — treat that as a
   deliberate product bet, not an accident of having built three separate
   features.
7. **Don't build scope the app doesn't need yet.** No social layer, no food
   database, no wearable sync, no LLM "coach" — until the deterministic,
   manual-data foundation underneath each is proven out.
8. **Respect the plan/performed split.** Programs are reusable templates,
   freely editable. Sessions are immutable records of what actually
   happened. New concepts extend one side or the other — never blur them.

---

## 4. Engineering Principles

- **Domain modeling:** the plan/performed separation is load-bearing —
  extend the *performed* side additively (new set/session concepts) rather
  than reaching back to mutate *planned* rows or merging the two. A typed
  discriminant that decides how to interpret other columns (`exercise.kind`)
  is a taxonomy commitment: never let a later edit to it silently reinterpret
  already-written historical rows.
- **API design:** validate every request body at the HTTP boundary with Zod
  (already used correctly in `env.ts`, not yet at any route) and derive the
  `@afya/shared` TS types from those schemas so the contract and the
  validator can't drift. A DTO `interface` is not a validator.
- **Database design:** additive, nullable columns for open-ended attributes
  (muscle group, equipment); a closed enum (`kind`) for the small set of
  values that drive core numeric behavior — these grow at different rates
  and shouldn't share a column design. Choose FK delete behavior
  deliberately per relationship; a cascade into an append-only historical
  table is a product decision, not a schema default.
- **Transactions:** use them for genuine multi-row invariants (position
  renumbering, reordering) exactly as already done in `programs.ts`/
  `sessions.ts` — don't wrap single-statement writes unnecessarily.
- **Testing:** the codebase has zero tests today. Start with the pure,
  dependency-free business logic (`records.ts`) — it's the cheapest module
  in the repo to test and it computes the app's most trust-critical numbers.
  Add integration tests for `rotationState` and `POST /:id/sets` against the
  real Postgres in docker-compose, not mocks, per the umbrella's stated
  testing philosophy. This is real debt but does not need to block product
  work — see §11 for why "tests before anything else" is rejected as written.
- **TypeScript:** no `any`, `as`, `!`, or suppressed errors — this codebase
  is already clean on that front; keep it that way as validation is added.
- **NestJS:** not applicable. The actual stack is Hono + Drizzle +
  node-postgres + Zod, per the umbrella Node blueprint. Discard any audit
  guidance that assumes Nest modules/providers/guards.
- **Frontend architecture:** cross-cutting state that must survive
  navigation (auth session, rest timer) belongs above the route level in the
  app shell (`AppLayout`), not as local state inside a screen component.
- **Performance:** the codebase already knows the right pattern
  (`inArray`-batched lookups in `exerciseMeta`/`programIdsForDays`) — reuse
  it the next time an N+1 shape appears (`buildDayExercises`'s per-exercise
  `lastSetFor` loop) rather than re-deriving a loop version.
- **Historical data integrity:** nothing that feeds a PR, a trend, or a
  historical display should be computed by joining live against current
  template/catalog state (see `fromProgram`, §5). Snapshot the facts that
  mattered at write time.

---

## 5. Critical Findings

### 5.1 Exercise deletion permanently destroys all historical training data
**Problem:** `DELETE /api/exercises/:id` deletes the exercise row; `setLog.exerciseId`
has `onDelete: "cascade"`, so every set ever logged against that exercise —
across every session, forever — is deleted with it, with zero confirmation of
scope and zero recovery path.
**Evidence:** `apps/api/src/db/schema/tracker.ts:122-124`, `apps/api/src/routes/exercises.ts:52-60`
(the route's own comment: "cascades to its program rows and set logs").
**Why it matters:** this is the single most severe violation of "what a user
did historically must remain accurate" in the codebase, and the only
available fix today for a typo'd exercise name (delete + recreate) *triggers*
this exact destruction.
**Recommended action:** add `archivedAt` (nullable timestamp) to `exercise`.
`DELETE` archives instead of hard-deleting once the exercise has any
`set_log` rows; hard-delete stays fine for a genuinely unused exercise.
Filter archived exercises from library/add-exercise pickers but keep them
resolvable for historical display.
**Dependencies:** none — additive migration, no other work blocks this.
**Risk of not addressing it:** silent, irreversible loss of months of
training history from what looks like routine library cleanup.

### 5.2 Warm-up sets contaminate the PR/1RM/volume math the flagship feature depends on
**Problem:** `set_log` has no warm-up/working discriminant; `computeRecords`
and `detectPrs` (`apps/api/src/records.ts`) and the `/trends/progress` "best
set per session" query score every logged set identically.
**Evidence:** `apps/api/src/records.ts:29-73`, `apps/api/src/db/schema/tracker.ts:115-138`,
`apps/api/src/routes/trends.ts:57-58`. Already self-diagnosed in `TODO.md` #4.
**Why it matters:** a light warm-up set can register as a "New PR" or mask a
real 1RM improvement — at exactly the moment (the live PR banner) the app is
supposed to build trust in its own numbers.
**Recommended action:** add `setType: 'working' | 'warmup'` (default
`'working'`) to `set_log`; filter to `'working'` in `computeRecords`,
`detectPrs`, and the trends query; add a lightweight toggle near "Complete
set" in `SessionScreen.tsx`.
**Dependencies:** none.
**Risk of not addressing it:** the PR/trend system — the app's best-built,
most differentiated shipped feature — quietly loses user trust.

### 5.3 Superset, section, and warm-up/cool-down structure is modeled and editable, but invisible during the actual workout
**Problem:** `programExercise.supersetGroup`/`section` and `programDay.warmup`/
`cooldown` are fully authored and visually grouped in `ProgramScreen.tsx`, but
`SessionScreen.tsx` renders `programExercises` as one flat list and never
references any of them. Worse, the active-exercise algorithm completes *all*
sets of one exercise before ever surfacing its superset partner — the
opposite of how a superset is performed.
**Evidence:** `apps/api/src/db/schema/tracker.ts:69-70,93-94`;
`apps/web/src/screens/program/ProgramScreen.tsx:257-271,367-376`;
confirmed by direct read that `SessionScreen.tsx` never references
`supersetGroup`/`section`/`warmup`/`cooldown` anywhere.
**Why it matters:** this is the clearest place the app is a strictly worse
Hevy — data effort spent configuring it produces zero behavioral difference
where it counts, which reads as a bug, not a missing feature. It's also the
most-corroborated finding in this review: three of the five audits flagged it
independently.
**Recommended action:** group adjacent same-`section`/`supersetGroup`
exercises visually in `SessionScreen.tsx` (porting the boundary logic already
written in `ProgramScreen.tsx:257-266`); show the day's `warmup` text once
above the exercise list; change active-exercise selection so a superset
partner is preferred over finishing the current exercise's remaining sets.
**Dependencies:** none — no schema or API change, purely `SessionScreen.tsx`.
**Risk of not addressing it:** every future "deepening" feature built on top
of this screen inherits the same gap; it is felt on every workout, not an
edge case.

### 5.4 Out-of-order exercise logging snaps focus back to the wrong exercise after every set
**Problem:** `completeSet()` unconditionally resets `override` to `null` for
any program exercise after logging a set — not only when that exercise is
actually finished — so `activeId` recomputes to "first incomplete in program
order," which is almost always a *different* exercise than the one just
worked.
**Evidence:** confirmed directly — `SessionScreen.tsx`: `setOverride(active.fromProgram ? null : active.exerciseId)`
inside `completeSet()`, paired with `activeId`'s "first not-done in order"
derivation.
**Why it matters:** this repeats after *every single set* logged out of
program order — equipment occupied, supersetting, warming up on something
else, all ordinary gym behavior — forcing a re-tap of the correct row each
time, while tired and moving between stations.
**Recommended action:** only clear `override` when the overridden exercise
itself is actually done (`active.loggedSets.length + 1 >= active.targetSets`),
not on every completed set of any program exercise.
**Dependencies:** none — one conditional, contained to `SessionScreen.tsx`.
**Risk of not addressing it:** ongoing, repeated friction on the app's
single highest-frequency interaction, for any non-linear session.

### 5.5 Rest timer state does not survive navigating away from the session screen
**Problem:** `useRestTimer()` is local state inside `SessionScreen`, and
`RestBar` is only rendered from `SessionScreen`'s own return statement.
Verified directly: `AppLayout.tsx` (the shell that persists across
navigation) renders only `<Outlet />` and `<TabBar />` — no timer provider.
Navigating to any other tab unmounts the countdown with no warning.
**Evidence:** `apps/web/src/screens/session/RestTimer.tsx:23-48`,
`SessionScreen.tsx:29,517-519`, `AppLayout.tsx:22-44`.
**Why it matters:** the rest timer's actual engineering (wall-clock-anchored
`endsAt`, audio + haptic completion, ±15s adjust) is one of the best-built
things in the app — losing it on an incidental tab switch (checking a text,
glancing at the program) happens constantly in real gym use and undermines
the one feature purpose-built to reduce in-workout friction. Notably, only
one of the five audits caught this despite two others reading the same
router/`AppLayout` files — independently reconfirmed here as real.
**Recommended action:** lift `useRestTimer()` into a small context/provider
mounted in `AppLayout`, render `RestBar` from there regardless of route.
**Dependencies:** none.
**Risk of not addressing it:** continues to silently break the app's most
polished feature via the most ordinary mid-workout action there is.

### 5.6 Mutation failures are completely silent, app-wide
**Problem:** every mutation in the app (`logSet`, `editSet`, `deleteSet`,
`createEx`, fuel add/remove, body-metric log) defines `onSuccess` only, never
`onError`. Confirmed by direct read of all four `SessionScreen.tsx`
mutations and `query-client.ts` (mutation retry left at React Query's
default of 0). No toast/error-banner component exists anywhere in
`apps/web/src`.
**Evidence:** `SessionScreen.tsx:67-93`, `FuelPanel.tsx:16-17`,
`BodyScreen.tsx:41`, `query-client.ts:1-13`.
**Why it matters:** a failed "Complete set" (dropped wifi, a Cloud Run cold
start) looks visually identical to one that never happened — no toast, no
retry, nothing. This is the single highest-frequency write in the entire
app, in the deployment environment (scale-to-zero backend, gym wifi) most
likely to make it fail.
**Recommended action:** add `onError` to every mutation, surfacing a visible,
actionable failure state (inline banner, manual retry using the mutation's
own stored `variables`).
**Dependencies:** none. Pairs naturally with 5.4/5.5's `SessionScreen.tsx`
work and with optimistic updates (§10) if that's tackled at the same time.
**Risk of not addressing it:** users lose logged sets without ever being
told, and stop trusting the data the rest of the product (PRs, trends,
volume) is built on.

### 5.7 No global error handler — production failures are invisible
**Problem:** no `app.onError` exists anywhere in the Hono app; no route
wraps DB calls in try/catch. Confirmed via direct read of `index.ts` and
grep across `apps/api/src` for `onError` (zero matches outside Redis-related
code).
**Evidence:** `apps/api/src/index.ts:1-58`.
**Why it matters:** an unexpected DB error today leaves zero trace — not in
logs, not in a consistent client response.
**Recommended action:** add a top-level `app.onError` that logs
method/path/error and returns a consistent `ApiErrorBody`-shaped 500.
**Dependencies:** none. Five minutes of work.
**Risk of not addressing it:** the only way to learn about a production bug
is a confused, unreproducible user report.

### 5.8 No exercise taxonomy — every future personalization feature is blocked on this
**Problem:** `exercise` is exactly `{ id, userId, name, kind, createdAt }` —
no muscle group, no equipment, no shared/canonical catalog. Confirmed via
direct schema read; exercises are strictly per-user (`unique(userId, name)`),
so any metadata added later requires a fuzzy per-user backfill, not a single
central migration.
**Evidence:** `apps/api/src/db/schema/tracker.ts:29-39`. Already flagged
`FOUNDATIONAL` in `TODO.md` #3.
**Why it matters:** AI-generated workouts, exercise substitution, and
muscle-imbalance/volume analytics — the app's stated long-term ambition — all
need structured exercise attributes to reason over. None exist, and the
per-user free-text design makes this expensive to retrofit the longer it's
left.
**Recommended action:** add nullable `primaryMuscleGroup`/`equipment` to
`exercise` now, even with no UI yet, and ship a small curated starter catalog
so real usage stops accumulating untagged data.
**Dependencies:** none — additive migration.
**Risk of not addressing it:** every "smarter" feature on the roadmap is
blocked, and the blocker gets more expensive the longer untagged exercises
accumulate.

---

## 6. Prioritized Roadmap

### NOW
- Stop exercise-delete cascade from destroying history (§5.1)
- Add `setType` (warm-up/working) and exclude warm-ups from PR/trend math (§5.2)
- Surface section/superset/warm-up/cool-down structure in `SessionScreen` (§5.3)
- Fix the out-of-order-logging focus-reset bug (§5.4)
- Lift the rest timer above the route so it survives navigation (§5.5)
- Add `onError` + a visible failure/retry state to every mutation (§5.6)
- Add a global `app.onError` handler with logging (§5.7)
- Add `primaryMuscleGroup`/`equipment` to `exercise` + a starter catalog (§5.8)
- Add a plain exercise-rename endpoint (name only — see §11 for why kind-editing is explicitly *not* included here) and a guarded "this will remove N sets" confirmation on delete
- Wire the already-built `PUT /api/fuel/target` to a small edit UI

### NEXT
- Make past sessions editable (edit/delete a logged set from `SessionDetailScreen`) — backend already supports it
- Weight-entry acceleration (hold-to-ramp) and/or tap-to-type numeric fallback
- Program switching: create/select/activate, enforce single-active-program via a partial unique index
- Snapshot `fromProgram` (and ideally target context) on `set_log` at write time instead of deriving it live
- Fix the streak calculation to track rotation cadence, not calendar-day adjacency
- Session backdating (`performedAt` override on session creation)
- Deterministic readiness flag from sleep/resting-HR vs. a rolling personal baseline
- Double-progression suggestion (`targetRepsMax`-driven weight/rep bump)
- Zod validation at the HTTP boundary, starting with `LogSetBody`/`UpdateSetBody`
- Body-fat metric UI (backend already supports it); a "finish workout" action wiring the already-modeled `session.note`
- Guard the set-completion "pip" tap with the same `isPending` check as the primary button; add a client idempotency key
- Tighten `CORS_ORIGINS` to the real deployed origin (see §11 — real fix, not an emergency)
- Targeted unit tests for `records.ts` and `rotationState`

### LATER
- N+1 batch fix for `buildDayExercises`'s per-exercise `lastSetFor` calls
- Wire the existing, unused `cached()` Redis helper into `/api/records` and `/api/trends/progress`
- De-duplicate `ownedDay` between `sessions.ts`/`programs.ts` into a shared module
- Fix check-then-act races (position assignment, exercise idempotent-create, set numbering) — do this *before*, not instead of, any real multi-device sync work
- Basic PWA installability (manifest); revisit a real offline queue only after §5.6's error-surfacing ships
- Cross-domain trend juxtaposition (bodyweight next to strength trend on one view)
- Rep-range-bucketed PRs / true session-volume aggregation (only once a progression-recommendation feature is actually scoped)
- Connection-pool sizing (`max`/`idleTimeoutMillis`/`statement_timeout`) — flag once at the umbrella level; not urgent at 3afya's current single-user scale

### AVOID
- An LLM-based "AI coach" — nothing here justifies it yet; every real
  opportunity identified is solvable with deterministic rules against data
  the app already has
- Wearable/HealthKit/Health Connect integration — before manual sleep/HR
  logging proves it survives real use for months
- A full nutrition/food-database module (macro breakdown, barcode scan, food
  search) — a different, saturated category that would cannibalize effort
  better spent on cross-domain synthesis
- Social feed / following / sharing — no audience for it, and it's the
  default "engagement" lever that pulls effort toward vanity metrics
- A generic repository/service layer or validation framework introduced
  speculatively — deduplicate when a second concrete copy exists, not before
- kg/lb unit toggle work of any kind right now — single-user, single-unit,
  no signal it's needed (see §11)
- Muscle-group volume dashboards or mesocycle/periodization UI *ahead of*
  their prerequisites (taxonomy, multi-program switching) landing first —
  sequencing, not cancellation
- A `kind`-editing feature on exercises, in any form, until a `kind` snapshot
  column exists on `set_log` first (see §11, §13)

---

## 7. Product Roadmap

| Feature | User problem | Product value | Complexity | Dependencies | Priority | Why now/later |
|---|---|---|---|---|---|---|
| Superset/section-aware session UI | Configuring a superset does nothing when actually training | Closes the single most-corroborated core-loop gap | S (frontend only) | none | NOW | Cheapest, highest-consensus fix available |
| Warm-up/working set flag | PRs/trends silently include warm-ups | Protects the app's flagship, most-trusted feature | S–M | none | NOW | Data integrity issue in a shipped feature |
| Guarded exercise archive + rename | Fixing a typo destroys history; no rename exists | Removes the app's worst data-loss trap | S | none | NOW | Irreversible risk, cheap fix |
| Exercise taxonomy + starter catalog | New users/features start from zero structure | Foundation for every future "smart" feature | M | none | NOW | Compounds in cost the longer it waits |
| Fuel target edit UI | Adherence % is measured against a number you can't change | Fixes a module whose core output is currently meaningless | XS | none | NOW | Backend already done, trivial UI |
| Editable history | Can't fix "I logged 225 but it was 235" | Baseline expectation of any tracker | S | none | NEXT | Backend already supports it |
| Weight-entry acceleration | Up to 60+ taps to reach a real working weight | Biggest single tap-count reduction available | S–M | none | NEXT | High-frequency friction, contained fix |
| Program switching | Can't run a new mesocycle/split without touching the DB | Normal, recurring behavior for a long-term user | M | partial-unique-index migration | NEXT | Backend half-built; real workflow gap |
| Deterministic readiness flag | Sleep/HR data is captured, never used | Cheapest real step toward the "closed loop" thesis | M | none | NEXT | No ML needed, high differentiation value |
| Double-progression suggestion | "Should I add weight today?" is unanswered despite the data existing | Real "tell me what to do" capability, zero ML | M | none | NEXT | Rep-range data already modeled, unused |
| Streak redefinition | The one retention mechanic reads 0 on the app's own demo data | Fixes a mechanic that currently demotivates instead of rewards | S | none | NEXT | Cheap, corrects a real self-contradiction |
| Session backdating | "I forgot to log yesterday" isn't supportable | Common workflow; workaround currently corrupts trend dates | S | none | NEXT | Contained, additive |
| Workout completion ritual | No "you finished, here's what you did" moment | Proven retention/reflection lever; field already exists | S | none | NEXT | `session.note` is a dead field today |
| Body-fat metric UI | Backend supports it, screen doesn't list it | Cheap already-paid-for win | XS | none | NEXT | Trivial addition |
| Cross-domain trend juxtaposition | Training/fuel/body trends never appear together | The actual differentiation thesis, made visible | S | none | LATER | Cheap once the other NEXT items land |
| Rep-range/volume-scheme PRs | PRs are single-dimension "best ever" | Enables richer progression schemes later | M–L | warm-up flag (§5.2) | LATER | Explicitly deferred until a real feature needs it |
| Muscle-group volume dashboard | No visibility into training balance across muscles | Analytics depth | M | exercise taxonomy | LATER | Correctly gated behind its prerequisite |

---

## 8. Data Model Roadmap

Ordered by what should land *before* the feature work that depends on it:

1. **`exercise.archivedAt`** (nullable timestamp) — soft-delete once any
   `set_log` rows reference the exercise; change the FK philosophy from
   "cascade always" to "archive if referenced, hard-delete only if unused."
   Blocks nothing; unblocks safe library hygiene.
2. **`exercise.primaryMuscleGroup` / `exercise.equipment`** (nullable text) —
   additive now, even with no UI, so untagged exercises stop accumulating.
   Prerequisite for: muscle-group analytics, exercise substitution, any
   equipment-aware feature.
3. **`set_log.setType`** (`'working' | 'warmup'`, default `'working'`) —
   protects every PR/trend computation. Prerequisite for: trustworthy
   progression recommendations, rep-range-bucketed PRs.
4. **`set_log.fromProgram`** (boolean, snapshotted at insert time) — stop
   deriving "was this from the program" live against the *current* program
   state; a session's historical classification should never change because
   someone edited a program months later.
5. **`program` single-active enforcement** — a partial unique index on
   `(user_id) WHERE is_active`, plus an explicit "activate" endpoint that
   flips the previous active program off in the same transaction. Currently
   the schema models "many programs" but nothing enforces or exposes it —
   this is the missing piece, not new modeling.
6. **`workoutSession.performedAt` override path** — no schema change; add
   acceptance of an optional past `performedAt` on `StartSessionBody`,
   validated to be in the past, that always creates its own closed session
   rather than merging into "today."
7. **Deferred, no action yet — a *rule*, not a migration:** `set_log.kind`
   snapshot. `kind` is immutable today (no edit endpoint exists), so nothing
   is currently broken. But the moment anyone builds a kind-edit or
   rename-with-kind-change feature, every historical set for that exercise
   would be silently reinterpreted (reps becoming "duration," weight becoming
   garbage) unless `kind` is snapshotted per-row first. Treat this as a
   standing precondition on that specific future feature (see §13), not
   scheduled work today.
8. **Deferred, correctly so:** rep-range-bucketed PR maxes and true
   session-volume aggregation. The current `SCORE`/`prKindsFor` design in
   `records.ts` is fine for today's feature set; extend it additively only
   once a real progression-recommendation feature is scoped, per the domain
   audit's own recommendation.
9. **Deferred, correctly so:** a `weightUnit` column. No evidence anyone
   needs kg support; adding this now is speculative work for a single-user,
   single-unit app (see §11).

---

## 9. Technical Roadmap

Highest-value first, scoped to what actually prevents bugs, enables product
work, or reduces future migration cost — not generic hardening for its own
sake:

1. **Global `app.onError`** — five-minute fix, converts invisible production
   failures into loggable ones. Prerequisite for meaningfully debugging
   anything else on this list.
2. **`onError` + visible failure state on every mutation** — the single
   highest-leverage frontend reliability fix; de-risks cold starts, flaky
   gym wifi, and double-submits all at once.
3. **Targeted tests for `records.ts` and `rotationState`** — the two
   riskiest, least-obvious pieces of business logic in the backend, and the
   cheapest to test (one is pure with zero I/O). Not a mandate to build a
   full test harness before other work — see §11.
4. **Zod validation at the HTTP boundary**, starting with the
   highest-traffic write (`LogSetBody`/`UpdateSetBody`). Currently masked by
   a well-behaved client; becomes a real liability the moment any other
   client exists. Derive `@afya/shared` types from the schemas.
5. **N+1 batch fix in `buildDayExercises`** — replace the per-exercise
   `lastSetFor` loop with a single `DISTINCT ON` query, reusing the pattern
   `exerciseMeta`/`programIdsForDays` already demonstrate correctly in the
   same file.
6. **Idempotency key on `POST /:id/sets`** — cheap insurance against the
   confirmed double-log risk (§10), and a prerequisite for safely adding
   mutation retries later.
7. **De-duplicate `ownedDay`** between `sessions.ts` and `programs.ts` into
   one shared module — pure duplication risk, not a missing-abstraction
   problem; don't build more than a shared function.
8. **Tighten `CORS_ORIGINS`** to the real deployed origin
   (`https://afya-qjyft4sfwa-uc.a.run.app`) — cheap, but see §11 for why this
   is not the five-alarm fire the backend audit frames it as.
9. **Wire the existing `cached()` helper** into `/api/records` and
   `/api/trends/progress` — only once real latency at real data volume
   justifies it; the infrastructure already exists and is well-built, this
   is a "flip it on" task, not new work.
10. **Fix check-then-act races** (position assignment via `existing.length`,
    exercise idempotent-create, client-supplied `setNumber`) — correctly
    scoped as a prerequisite for multi-device sync, not urgent standalone
    while the app is single-writer.
11. **Connection-pool tuning** — real, but an umbrella-wide concern (shared
    `mi7rab-db` across multiple apps), not a 3afya-specific priority at
    current single-user scale. Raise once at the umbrella level.

---

## 10. UX Roadmap

Ranked by reduction in taps / typing / navigation / cognitive load / waiting
/ mistake-recovery cost, for the active workout loop specifically:

1. **Fix the out-of-order focus-reset bug** (§5.4) — zero added taps to fix,
   removes a recurring +1-tap penalty on every out-of-order set.
2. **Lift the rest timer above the route** (§5.5) — zero added taps, removes
   a total-loss failure mode on the app's most polished feature.
3. **Visible mutation failure + retry states** (§5.6) — converts "silently
   broken" into "clearly broken, tap to retry" for the highest-stakes tap in
   the app.
4. **Weight-entry acceleration or numeric fallback** — the single largest
   tap-count reduction available (up to 60+ taps saved on any never-logged
   exercise); keep the no-popup-keyboard stepper as the default interaction,
   add acceleration/typed-entry as an escape hatch, don't replace the
   stepper outright.
5. **Guard the pip tap with `isPending`; add a client idempotency key** —
   currently zero taps required to accidentally create a duplicate set.
6. **Enlarge/confirm the delete-set control** — currently the smallest,
   least-guarded touch target in the app sits directly next to the
   correction controls it's meant to complement; a destructive action should
   be harder to trigger by accident than logging a set, not easier.
7. **Make `requireUser` network-failure-tolerant** — only redirect to
   sign-in when the server actually responds "no session," never when the
   request itself fails; add a themed router error boundary as a backstop.
8. **Optimistic update on `logSet`** — removes perceived multi-second stalls
   on the first tap of a session against a scale-to-zero backend; pair with
   #3's rollback path.
9. **Standardize the reps-stepper touch target** for weighted exercises to
   the same 44px used everywhere else — no functional reason found for it
   being smaller.
10. **Surface superset/section/warm-up structure** (§5.3) — listed under
    Critical Findings, repeated here because it is also, independently, the
    single largest core-loop UX gap identified across every audit.

---

## 11. Conflicts Between Audits

**A. CORS wildcard severity.**
*Backend audit's position:* Critical/Now — "reflecting any origin with
credentials enabled" is a well-known anti-pattern; fix immediately.
*My reading:* real, but overstated as a live security emergency. Better
Auth's session cookie is `sameSite: 'lax'`, which is a real second layer
(not "incidental," as the backend audit calls it) — it already blocks the
credentialed cross-origin request the finding describes for the common
browser attack shape. More importantly, 3afya's own `CLAUDE.md` documents
`CORS_ORIGINS=*` as an **intentional, known** current decision, with an
explicit warning not to reintroduce the old broken placeholder domain in its
place.
*Decision:* fix it — set `CORS_ORIGINS` to the real, live origin
(`https://afya-qjyft4sfwa-uc.a.run.app`), which is different from, and safe
compared to, the old broken placeholder the `CLAUDE.md` warns against. But
schedule it as a NEXT-tier cheap correctness fix, not a Now-tier incident.

**B. Whether `kind`-snapshotting is urgent work.**
*Domain audit's position:* Priority "Now" — add a `kind` snapshot column to
`set_log` before anything else touches exercise kind.
*My reading:* `kind` is immutable today (no edit endpoint exists anywhere in
`exercises.ts`), so there is no live bug — only a latent one that activates
if and when a kind-edit feature is ever built.
*Decision:* don't schedule the snapshot migration as active work now. Ship
the cheap, real win instead (a plain **name-only** rename endpoint, no kind
change) and record the snapshot requirement as a standing precondition on
any future kind-editing feature (§13, §15) rather than backlog work with no
current trigger.

**C. Whether a full test suite must precede other work.**
*Backend audit's position:* ranks "stand up Vitest, test everything" as
literally the top recommended action, ahead of any product/data fix.
*My reading:* correct that zero tests is real debt, but this is generic
audit boilerplate not calibrated to context — a solo personal project with
no CI pressure and no contributors doesn't need a blocking test-first
mandate before shipping five small, well-scoped, high-value fixes (cascade
delete, warm-up flag, superset UI, rest timer, mutation errors).
*Decision:* ship the NOW-tier product/data fixes first; add targeted tests
for the two riskiest pure/business-logic modules (`records.ts`,
`rotationState`) as part of that same pass, not as a separate blocking phase.

**D. Priority of surfacing superset/section/warm-up structure in the session.**
*Product-lead audit's position:* ranks this #1, priority "Now."
*Domain/Strategy audits' position:* priority "Later"/"Soon" respectively.
*Decision:* side with the product-lead audit — elevate to NOW. It requires no
schema or API change, it's contained to one file, and it is the
single most-corroborated finding across the whole review (three of five
audits flagged it independently, arriving at the same lines by different
routes).

**E. Rest-timer-survives-navigation — a finding one audit missed entirely.**
The UX audit reviewed `router.tsx` and `AppLayout.tsx` directly but never
flagged that the rest timer dies on navigation; only the product-lead audit
caught it. Independently reconfirmed here as real and severe (§5.5).
*Decision:* keep it as a Critical/NOW finding regardless of the 4-of-5
audits that didn't mention it — verified directly against the code, not
inferred from audit consensus. Worth noting as a reminder that even a
thorough, file-specific audit can miss something adjacent to what it read.

**F. Whether to touch weight-unit handling now.**
*Domain audit's position:* add a nullable `weightUnit` column now — "cheap
to fix now, expensive once mixed-unit data exists."
*Product-lead/Strategy audits' position:* explicitly listed as a feature
that should **not** be built yet — single-user, single-unit, solve it if it's
ever actually needed.
*Decision:* side with the product/strategy audits. No code change now. This
is speculative work with no current trigger for a single-user app; revisit
only if multi-user or non-US usage becomes an actual goal.

**G. Connection-pool sizing / cross-database referential integrity urgency.**
*Backend audit's position:* frames as a real scaling risk worth fixing soon.
*My reading:* real, but it's explicitly a shared concern across every Node
app on the umbrella's shared `mi7rab-db` instance, not something specific to
3afya's current single-user traffic.
*Decision:* note it, don't schedule 3afya-specific work for it; raise once
at the umbrella `CLAUDE.md` level instead, where it actually belongs.

---

## 12. Things That Are Already Good

Preserve these — do not rewrite for the sake of change:

- **Plan/performed separation with no session-exercise join table.** The
  single most important correct decision in the schema; keeps programs
  freely editable and sessions immutable. Don't "fix" the lack of a join
  table — it's deliberate (per 3afya's own `CLAUDE.md`).
- **Rotation-based "today"** (next day after the last session, not
  weekday-pinned) — avoids the calendar-edge-case bugs a naive weekday model
  would hit, and correctly matches how real training splits work.
- **PR detection computed at write time, not a cached/duplicated table** —
  avoids a records table that could drift out of sync with the source data.
- **Auto-prefill + delta cue** (`↑ +5 lb vs last time`) — a small, genuinely
  high-value detail that turns every set into an implicit progressive-overload
  prompt with zero extra taps.
- **Rest timer's actual engineering** (wall-clock-anchored `endsAt`, immune
  to background-tab throttling, audio + haptic completion) — the
  implementation is excellent; only its *scope* (§5.5) needs fixing, not the
  timer itself.
- **`requireAuth`/ownership-check discipline** — every route derives
  `userId` from the session; no route trusts a client-supplied id, and
  ownership is consistently re-derived through the FK chain rather than
  trusted. A genuinely load-bearing security invariant, applied with no
  exceptions found.
- **`records.ts` as a pure, dependency-free module** — no DB, no HTTP, no
  side effects. The best-designed file in the codebase; give it the tests it
  deserves (§9), don't restructure it.
- **Zod-validated environment config at boot** (`env.ts`) — the exact model
  the request-validation fix (§9) should extend to the HTTP boundary.
- **Redis integration designed for graceful degradation** (`redis/cache.ts`,
  `redis/client.ts`, rate-limit middleware) — real care about what happens
  when a dependency is unavailable, done correctly.
- **Single shared contract package** (`@afya/shared`) — one source of truth
  for request/response shapes; no duplicated type definitions found.
- **Design restraint** — one accent color, consistent "Vitality" direction
  across every screen, no competing visual noise.
- **Scope discipline already exercised** — no social feed, no food database
  depth, no dark-pattern engagement mechanics. These are correct,
  deliberate exclusions (confirmed explicitly in `TODO.md`), not gaps.

---

## 13. Dangerous Future Decisions

- **Adding a `kind`-edit or kind-changing rename feature without first
  adding a `kind` snapshot column to `set_log`.** Would silently reinterpret
  every historical weight/reps/duration value for that exercise the moment
  it shipped, with no warning and no way to detect it happened.
- **Building an "AI coach" or LLM-based recommendation feature on top of
  today's PR/trend data** while warm-up sets are still unflagged (§5.2).
  Would encode confidently-wrong advice on top of a signal that's already
  known to be corrupted.
- **Letting untagged exercises keep accumulating** before the taxonomy
  columns exist (§5.8/§8.2). Because exercises are per-user free text, every
  day of delay makes the eventual backfill (fuzzy name-matching against a
  canonical list, per-user) more expensive, not less.
- **Starting multi-device sync before fixing the check-then-act races**
  (position assignment, exercise idempotent-create, client-supplied set
  numbers). These are invisible today because there's exactly one writer;
  they become real, hard-to-reproduce data corruption the moment a second
  concurrent writer exists.
- **Introducing a generic repository/service layer, or a uniform validation
  framework, speculatively** — explicitly warned against by the backend
  audit itself and consistent with this project's stated anti-abstraction
  stance. Deduplicate when a second concrete copy exists (§9.7); don't build
  a layer in anticipation of a third.
- **Expanding nutrition tracking into a real food database** (macro
  breakdown, barcode scan, food search). A different, saturated category
  requiring a licensed/scraped database and ongoing maintenance — it would
  cannibalize engineering time from the actual differentiator (cross-domain
  synthesis) for a feature Hevy/MyFitnessPal already do better.
- **Treating "multiple programs" as a solved problem because the schema
  supports it.** Building more program-level features (mesocycle planning,
  block periodization UI) on top of the current half-built multi-program
  state — no enforced single-active invariant, no switch UI — would compound
  confusion rather than add value. Fix the invariant first (§8.5).
- **Reintroducing the old placeholder custom domain** (`afya.ribhielzaru.com`)
  into `CORS_ORIGINS` or `BETTER_AUTH_URL` when tightening CORS (§11.A). It
  isn't real and will break login with Better Auth's "Invalid origin" error —
  explicitly warned against in 3afya's own `CLAUDE.md`; use the actual live
  Cloud Run URL instead.

---

## 14. Top 20 Recommendations

| Rank | Recommendation | Category | Impact | Effort | Priority |
|---|---|---|---|---|---|
| 1 | Stop exercise-delete cascade from destroying history (archive, don't cascade) | Data/Backend | High | S–M | NOW |
| 2 | Add warm-up/working set distinction; exclude warm-ups from PR/trend math | Data/Backend | High | S–M | NOW |
| 3 | Surface superset/section/warm-up/cool-down structure in the live session | Frontend/Product | High | S | NOW |
| 4 | Fix the out-of-order-logging focus-reset bug in `completeSet()` | Frontend | High | XS | NOW |
| 5 | Lift the rest timer above the route so it survives navigation | Frontend | High | S | NOW |
| 6 | Add visible failure + retry state to every mutation (no more silent failures) | Frontend | High | S | NOW |
| 7 | Add a global `app.onError` handler with logging | Backend | High | XS | NOW |
| 8 | Add exercise taxonomy (muscle group/equipment) + a starter catalog | Data/Product | High | M | NOW |
| 9 | Add exercise rename (name-only) + a guarded, scope-stating delete confirmation | Backend/Frontend | Medium-High | S | NOW |
| 10 | Wire the existing fuel-target endpoint to a real edit UI | Frontend | Medium | XS | NOW |
| 11 | Add weight-entry acceleration or a numeric-entry fallback | Frontend | High | S–M | NEXT |
| 12 | Make past sessions editable (edit/delete a logged set from history) | Frontend | Medium-High | S | NEXT |
| 13 | Program switching: create/select/activate + enforce single-active invariant | Backend/Frontend | Medium | M | NEXT |
| 14 | Deterministic readiness flag from sleep/resting-HR vs. rolling baseline | Product/Backend | Medium-High | M | NEXT |
| 15 | Double-progression suggestion from `targetRepsMax` | Product/Backend | Medium-High | M | NEXT |
| 16 | Snapshot `fromProgram` on `set_log` at write time | Data | Medium | S | NEXT |
| 17 | Fix the streak calculation to track rotation cadence, not calendar days | Product | Medium | S | NEXT |
| 18 | Add Zod validation at the HTTP boundary, starting with set-logging | Backend | Medium | M | NEXT |
| 19 | Add session backdating (`performedAt` override) | Backend/Frontend | Medium | S | NEXT |
| 20 | Guard the set-completion pip with `isPending`; add an idempotency key | Frontend/Backend | Medium | XS–S | NEXT |

---

## 15. Global Project Rules

Durable rules for any future coding agent working on this app — not a
backlog, and not tied to any current sprint:

1. **Every historical row must snapshot the facts that mattered at write
   time.** Nothing feeding a PR, a trend, or a historical display should be
   computed by joining live against the current program/catalog state.
2. **Before adding any new workout concept, decide explicitly whether it
   belongs to planned training, performed training, or a derived/computed
   view** — and never blur the plan/performed boundary with a join table.
3. **Catalog data (the exercise library) must never cascade-delete
   performance history.** A delete against a row with historical references
   archives; it does not destroy.
4. **A typed discriminant that decides how to interpret other columns**
   (like `exercise.kind`) **is a taxonomy commitment.** Never let a future
   edit to it silently reinterpret historical rows without a snapshot column
   in place first.
5. **Finish a schema field's read and write path together, in the same
   change.** A column that's readable but never writable (or vice versa) is
   worse than not having the field — it looks finished when it isn't.
6. **The active workout loop is the highest-frequency, highest-stakes
   surface in the app.** Evaluate every change to it by tap count, ability to
   recover from a mistake, and behavior on a flaky connection — not just the
   happy path.
7. **Every state-changing mutation must have a visible pending/success/
   failure outcome.** Silent failure on a write path the user just acted on
   is never acceptable.
8. **Do not introduce a generic repository/service layer, validation
   framework, or other structural abstraction until at least two concrete
   call sites need it.** Deduplicate the moment a second copy exists — not
   before, not "just in case."
9. **Do not build AI/ML-flavored personalization on top of data that is not
   yet trustworthy.** Fix the underlying signal (e.g., warm-up flagging)
   before building a smarter feature on top of it.
10. **A new feature ships only if it improves logging, progression,
    understanding, or personalization.** "A competitor has it" is not a
    reason on its own.
11. **This is a personal, single-user, self-hosted app unless a future
    decision explicitly changes that framing.** Don't add multi-tenant,
    social, unit-preference, or localization scaffolding speculatively.
