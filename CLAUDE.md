# CLAUDE.md — 3afya

عافية (3afya, "well-being, vitality") is a personal, self-hostable workout &
health tracker. It follows the shared blueprint in the umbrella
**[`../CLAUDE.md`](../CLAUDE.md)** ("Node apps" throughout) — read that for
the stack, code principles, and how-Claude-should-work rules. This file only
records what is specific to 3afya.

**For architecture overview, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).**

## App-specific

- **Scope:** `@afya/*` · **package manager:** pnpm · **Node:** 22.
- **Ports:** web **5174**, api **3001**, Postgres **5435**. No Redis.
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

## Sessions

- **Sessions live in Postgres**, in mi7rab's shared auth database — 3afya reads
  and writes the `session` table but never migrates it. There is no Redis here.
- Redis went away because sessions were pure-Redis on a free Upstash instance
  that is deleted after 14 days idle; when it vanished every app in the umbrella
  500'd on `/api/auth/*`. See mi7rab's `CLAUDE.md` for the full account,
  including why Better Auth's stateless mode does not apply.
- **Asking whether you are signed in has three outcomes, not two.** A signed-out visitor
  gets `{ data: null, error: null }`; an unreachable API makes `authClient.getSession()`
  **throw** before it resolves at all. `lib/auth/session-check.ts` is the only place that
  distinction is made — the router's guards act only on `answered: true`. Treating a failed
  request as "signed out" ejected people mid-workout on gym wifi (T-005). An offline app
  cannot prove you are signed out, so it must not act as though it had.
- `session` is declared in `apps/api/src/db/schema/auth.ts` (regenerate with the
  Better Auth CLI, don't hand-edit). Because `drizzle.config.ts` globs
  `src/db/schema/*`, a migration also creates an **unused copy** of the auth
  tables in 3afya's own domain DB — that is pre-existing behaviour for
  `user`/`account`/`verification`, and `session` now joins them. The live rows
  are always in mi7rab's DB.

## Critical Business Rules

**For general domain model, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).** This section only records implementation-critical rules that aren't obvious from the schema.

### Exercise Catalog Tagging
- **Exact match only, never fuzzy**: `findCatalogExercise(name)` does case-insensitive exact match. Unknown names stay untagged (honest degradation via `[]` alternatives) rather than guessed.
- **Tags stamped on create only**: Adding a catalog entry later tags exercises created from then on but does not retroactively tag existing rows. New catalog entries need their own backfill migration.
- **Migration/catalog sync**: `0010_backfill_exercise_tags.sql` was printed from the constant, not typed. The VALUES list and constant must never disagree.

### Exercise Picking (program builder)
- **Creating is an explicit choice, never a fallback**: `ExercisePicker` searches the library and the catalog as one list; "Create <name>" is a separate last row shown only when nothing answers to that name. The old exact-match-else-POST path is what produced untagged duplicate library rows (ISS-008).
- **Matching is substring + token, never fuzzy**: `matchesQuery` requires every query token to appear in the name. An abbreviation the name doesn't contain ("db") does not match — same rule as the catalog's exact lookup, for the same reason.
- **A catalog pick sends no `kind`**: the server resolves kind, muscle group and equipment from the catalog entry. Sending a kind would defeat the tagging that makes the pick worth making.
- **Swapping is in place**: `PATCH /api/programs/day-exercises/:id` with `exerciseId` keeps position, section, superset group, targets and rest. Adding and swapping onto a `time` exercise share `DEFAULT_HOLD_SEC`.

### Mid-workout Swaps (session substitutions)
- **A swap inside a program day is a `session_substitution` row**, not an ad-hoc add:
  `(sessionId, programExerciseId, exerciseId)`, unique per slot. `buildDayExercises`
  renders the slot as the substitute carrying the slot's own targets, section, superset
  group and rest, with `fromProgram: true` and `substitutedFor` naming what it replaced.
  The program day is untouched — next week still plans what it planned.
- **This is what makes a swapped session finishable.** Before ISS-012 a substitute joined
  as an ad-hoc exercise, and `isExerciseDone` requires `fromProgram`, so it could never be
  done and `pipCount` asked for one more set forever. Anything that gives a program slot an
  ad-hoc stand-in reintroduces that.
- **Substituting the slot's own exercise deletes the row** — that is the undo, and the only
  one. There is no separate DELETE endpoint.
- **Sets logged against the planned exercise before the swap become ad-hoc**, because the
  slot's `exerciseId` is no longer in `programIds`. That is deliberate: they were performed.
- **A day performs each exercise once**: `POST /api/sessions/:id/substitutions` refuses a
  substitute another slot already holds. Two slots sharing an exercise would share one pool
  of logged sets and each would read as the other's progress.
- **The swap picker's `alreadyInDay` is the session's exercises for a day session** and
  empty for freeform, which is what keeps that refusal off the screen in the first place.

### Exercise Alternatives
- **Equipment-first ranking**: `rankAlternatives` puts different equipment before same equipment within each half (library then catalog). This is the whole point — you look for a substitute because the machine is taken.
- **Untagged source = empty result**: An exercise with no `primaryMuscleGroup` returns `[]` rather than guessing.

### Exercise Deletion
- **`setLog.exerciseId` is `onDelete: "restrict"`**: Postgres itself refuses deletion if any sets reference the exercise. The handler checks first and soft-deletes via `archivedAt` if history exists.
- **Resurrection on name collision**: Because `(userId, name)` is unique, `POST /api/exercises` with an archived exercise's exact name clears `archivedAt` rather than erroring.
- **`programExercise.exerciseId` is `onDelete: "cascade"`**: Template references are disposable; historical training data is not.

### Freeform Sessions
- **A freeform session is `workout_session.dayId is null`** — the same session row every
  program day uses, just belonging to no day. There is no separate activity table: a ride,
  a run and a set of push-ups are exercises with a kind, logged as sets like anything else.
- **Freeform sessions are invisible to the rotation**: both `rotationState` queries filter
  `isNotNull(dayId)`, so a Tuesday bike ride neither resumes a day nor advances "next up".
  Removing either filter silently resets the rotation to day A.
- **One freeform session per calendar day**, find-or-create via `POST /api/sessions`
  `{ freeform: true }` → `todayFreeformSession`. Same shape as the per-day find-or-create,
  same non-guarantee under concurrency.
- **`GET /api/sessions/freeform` returns `day: null`** and only ad-hoc exercises. `day: null`
  is what puts `SessionView` into freeform mode; both modes are one component parameterized
  by `SessionTarget`, so the log/edit/PR behaviour cannot drift between them.

### The `distance` Kind
- **`distance` sets store the unit they were entered in** (`set_log.distance_unit`), never a
  normalized number: a 7-mile ride reads back as 7 mi. Comparisons convert to metres
  (`apps/api/src/distance.ts`); display never does.
- **A distance with no recognized unit is not a distance.** `parseDistanceUnit` returns null
  for anything but `mi`/`km`/`m`, and `toMetres` scores a unit-less distance as 0.
- **Duration is optional on a distance set.** An untimed ride holds no duration PR, which is
  why `prKindsFor("distance")` can return both kinds safely.
- **The web never converts units.** The session delta is shown only when the last set used
  the same unit, and history totals sum only within one unit — both say less rather than
  convert behind the user's back. Trends is the one place that converts, server-side, and
  charts in the exercise's most recently logged unit.

### "Vs last time" (set comparison)
- **A set is compared against the same working-set position in the previous session**, never
  against whichever set was logged last. `TodayExercise.previousWorkingSets` carries the
  previous session's working sets in order; `lib/set-comparison.ts` owns the rule (T-004).
  Ordering by `completedAt` alone scored a fresh set 1 against a fatigued set 4.
- **Position counts working sets only.** A warm-up takes a set number (seeded warm-ups are
  all `setNumber` 1), so matching raw `setNumber` would score a working set against a
  warm-up. Warm-ups are excluded on the server and the client, and an armed warm-up is not compared.
- **No counterpart means no number.** An extra set beyond last time's count reads "No set N
  last time" rather than falling back to the last set. Every "say nothing" case is its own
  `SetComparison` state, so the screen never claims "first time" for a set that has history.
- **The entry card pre-fills once from the matching set**, falling back to last time's final
  working set; the user's edits carry forward from there.

### Session Immutability
- **No session-exercise join table**: Exercises belong to a session iff they have ≥1 logged set. Ad-hoc exercises are surfaced by `adhocExercises` with `fromProgram: false`. This keeps sessions immutable records and programs reusable templates.
- **Set snapshots (`set_log.from_program`, `set_log.exercise_kind`)**: written at insert by
  `POST /sessions/:id/sets`, decided server-side by `isPlannedInSession` (the day's slots with
  this session's substitutions applied, via `performedExerciseIds`, the same rule
  `buildDayExercises` uses). History (`GET /sessions`, `GET /sessions/:id`) reads only these,
  so removing an exercise from a day no longer rewrites what was planned (T-006). The **live
  session screen still derives plannedness live**. That is deliberate, because the mid-workout
  swap rules depend on it. Rows before `0018` were backfilled from the program as it stood
  then: best effort, identical to the old live join. Records and trends still read
  `exercise.kind` live; that is safe only while kind is not editable (RULES 4).
- **Day name snapshot**: `workoutSession.dayName` is set at creation (both paths) and read as stored snapshot → live join → null. Reading the join first would re-break history on a rename.
- **Two latest-session queries**: `rotationState` runs both `latestSession` (for resume) and `latestSessionWithSets` (with sets, for rotation); both are restricted to sessions that have a `dayId`. Empty sessions must not advance rotation, and neither must freeform ones.
- **Empty session deletion**: `DELETE /api/sessions/:id` refuses once the session has any `set_log` row.
- **A set log carries an idempotency key**: `set_log.idempotency_key` is unique per `(session_id, idempotency_key)`, so a second insert bearing a key the session already used is refused by Postgres rather than by application code. NULLs are distinct by default, which is why the column is nullable and every keyless or pre-existing row still inserts. A replay returns **200** with the original row and PRs recomputed against state at replay time; **201** is a fresh insert. A malformed key is treated as keyless rather than rejected — the set actually happened, and refusing it to punish a bad field loses the thing worth keeping.
- **The key belongs to a set slot, not to a tap**: `lib/set-slot.ts`. `SessionScreen` holds `Map<slot, key>` in a ref, keyed `exerciseId:setNumber`. Two taps of one slot must send the *same* key or the unique index never fires. Keys are **retained** across a successful log (`onSuccess` only invalidates, so the set count is stale for a full RTT while `isPending` is already false) and **cleared on delete success**, because `DELETE /sessions/:id/sets/:setId` renumbers the remaining sets and every held key would then name a different slot. Edit needs no clear; PATCH never touches `setNumber`.
- **That map must stay mounted-scoped to `SessionScreen`**: sets can also be deleted from `SessionDetailScreen`, which shares no state with it. What covers that is `SessionScreen` unmounting on navigation. Hoisting the map to a module singleton or an `AppLayout` context (as the rest timer was hoisted) would silently reintroduce the replay.
- **Contrast — `POST /api/sessions` still has no concurrency guarantee.** It is a different endpoint and this ticket gave it nothing; only the set-log path is guarded.
- **`POST /api/sessions` is find-or-create per (day, calendar day)** via `todaySessionForDay` — a second POST with the same `dayId` returns the existing row with 200 rather than inserting. It's not a concurrency guarantee.
- **`nutritionTarget` is append-only**: `PUT /api/fuel/target` INSERTs; nothing ever updates or upserts it. This lets historical adherence be scored against the target in force *then*.
- **`isWarmup` filtering**: `apps/api/src/records.ts` filters warm-ups internally. Every caller must include `isWarmup` in its `RecordSet`-shaped query/object or silently treat all sets as working sets. Select `recordSetColumns` (`db/record-set-columns.ts`) rather than listing columns by hand — that list is where a forgotten column stops being possible.
- **Frequent fuel labels**: Derived from user's own entries only — exact match on `lower(trim(label))`, no food catalog, no fuzzy matching.

## Critical Web Implementation Rules

**For general web architecture, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).**

- **Freeform is the same screen**: `SessionScreen` and `FreeformSessionScreen` are thin
  wrappers over `SessionView({ target })`. Add session behaviour to `SessionView`, not to a
  wrapper, or the two modes diverge.
- **`isExerciseDone` is false for ad-hoc exercises** (it requires `fromProgram`), which is
  what keeps a freeform session focused on what you just added instead of declaring itself
  finished after one set. A mid-workout swap is *not* ad-hoc — see **Mid-workout Swaps** —
  precisely because a program slot must stay finishable.
- **Typed numbers go through `DraftInput`**: it holds the raw keystrokes so half-finished
  text ("7.", "12:") doesn't collapse to a number mid-entry, and commits only what parses.
  Give it a `key` on the thing being edited — remounting is how a stale draft is abandoned.
- **Durations are typed as clocks**: `parseDuration` accepts `45`, `45s`, `12:30` and
  `1:05:00`; `fmtClock` is its inverse. Steppers stay for nudging, but a 40-minute ride is
  typed, not tapped.
- **An outage is confirmed by a probe, never inferred from one failure.** `lib/api/api-status.ts`
  holds the reachability flag; a failed request only calls `requestProbe()`, and `ApiStatusBar`
  decides by asking `/health` and checking the body is `{ ok: true }`. A single 500 from a
  handler is not an outage, and a 200 of HTML is not health.
- **The same outage looks different in dev and prod.** In prod the browser reaches the API
  directly, so a dead server throws before any response exists. In dev the Vite proxy answers
  for it and turns a refused connection into a plain **500 text/plain**. Classifying failures
  by status alone misses one of the two — which is why the probe, not the classifier, is the
  source of truth. `/health` also lives at the API **root**, not under `/api`, so
  `vite.config.ts` proxies it explicitly: without that line it resolves to the dev server's
  SPA fallback and answers 200 with `index.html`, making a down API look healthy.
- **Every mutation goes through `useTrackedMutation`**: `lib/query/use-mutation-error.ts`.
  A screen holds one `useMutationError()` slot; each mutation reports into it and the
  banner renders `errors.failure`. Never write a bare `useMutation` — a write with no
  `onError` fails silently, which [`RULES.md`](./RULES.md) rule 8 forbids. The wrapper exists
  because a mutation cannot name itself inside its own declaration (the retry needs `mutate`,
  and referencing the binding being declared makes its type circular), and because the failed
  variables are only still in hand inside `onError`: most call sites fire from inside a `map`
  over server data, or from an input whose value is gone by the time the request fails.
- **Retry is hidden on 4xx**: `isRetryableError` (`lib/api/errors.ts`) reads `ApiError.status`.
  A rejected `fetch` never becomes an `ApiError`, so anything that isn't one is a transport
  failure and stays retryable; 408 and 429 are the two 4xx that do. A dead Retry button is
  worse than none — that was the bug on the history screen, where "retry" refetched queries
  instead of re-issuing the write.
- **One `SetEditor` for every logged set**: the session screen and history both correct sets
  through `components/SetEditor.tsx`. Per-kind editing behaviour goes there, or the two
  surfaces drift.
- **Rest timer context**: The app's one React Context is mounted in `AppLayout` (not `SessionScreen`) so it survives navigation. Follow the outer-provider/inner-consumer split pattern for any future shell-level context.
- **SessionScreen focus is derived**: `activeId` = override if still valid/incomplete, else first incomplete in program order. `completeSet()` must stay pinned on the just-logged exercise until that exercise (or both superset members) is done.
- **Extra sets pin focus**: `completeSet()` tests `loggedSets.length >= targetSets` before superset logic and re-pins `override`, so extra sets never advance focus.
- **Session creation ref**: `SessionScreen` stores the id of any session it creates in a ref because a failed set-POST doesn't invalidate. The ref is cleared on success.
- **`isExerciseDone` is the single source of truth**: Shared by `SessionScreen` and `StartScreen`. Don't re-inline it — the point is the two screens can't disagree.
- **Client-side rotation advance**: `StartScreen` owns moving "NEXT UP" past a finished day because the API keeps returning today's day. If rotation ever advances server-side, delete the client rule.
- **Fuel target invalidation**: Target editing must invalidate both `["fuel","today"]` and `["fuel","history"]` — TrendsScreen scores against `FuelHistory.target`.
- **Fuel has its own tab, `/fuel`** (T-051). `screens/fuel/FuelPanel.tsx` is the full panel. Start renders
  `FuelSummaryCard` instead: the meters, 3 quick-adds and a link. Both read `useFuelToday()` and log through
  `useLogFuel()` in `screens/fuel/fuel-today.ts`, on one `FUEL_TODAY_KEY`, and render the same `FuelMeters` and
  `QuickAddChips`. That shared key is why a log on either surface shows on both. Don't give the card its own query.
  The tab bar holds six tabs at 390px with ~20px to spare; a seventh doesn't fit without changing `.tab`.
- **Correcting a fuel entry is `PATCH /api/fuel/:id`** (T-046). It replaces label and numbers and
  keeps `loggedAt`, since the food was eaten when it was logged. POST and PATCH validate through one
  `readFuelFields`. In `FuelPanel` a row's label is the edit target, and the form reuses `FoodFields`
  with "Log something else". A stored 0 reopens **blank**, because a food may declare only one number.
  The update's `onSuccess` **awaits** the refetch before closing the form. Closing first flashed the
  row's old numbers for a round trip after "Save", and the browser check caught it.
- **Day letters**: Use index in `program.days` (`String.fromCharCode(65 + i)`), never `programDay.position` (not re-packed on delete).
- **Armed confirm pattern**: two taps within `DELETE_ARM_MS` (4s), via `useArmedConfirm` in
  `lib/use-armed-confirm.ts` — one armed target at a time, self-disarming. Used for delete day,
  remove exercise, remove empty session, remove set. Reuse the hook rather than a modal or a
  hand-rolled timer; call `disarm()` from the mutation's `onSuccess`.
- **Removing a logged set is `RemoveSetButton`** (`components/`), shared by the session screen and
  history exactly as `SetEditor` is. Both faces are disabled while the delete is pending: the arm
  window can expire mid-request, and a live × on the row being removed would let a second tap
  delete a set that is already gone (404, then a Retry for nothing). Its 44px box overhangs the
  row padding with negative margins so the row stays as short as the 24px steppers.
- **Program builder sizing**: Controls sized against 390px budget. `.ord`, `.ctl button`, `.pex-del` use `flex: none`. Re-do arithmetic before adding controls.
- **Section/superset editing is a panel, not inline inputs**: one 44px `.pex-grouping` control per exercise states what the row carries and opens `.pex-grouping-panel`; swap and grouping share `openPanel` so only one expands a row (ISS-007). Inline 11px inputs were a ~25px target labelled only by a placeholder.
- **Uncontrolled fields are keyed on their stored value** (`${ex.id}:sec:${ex.section ?? ""}`): a stable key never re-syncs a `defaultValue` input, so a rejected edit sits in the field reading as saved.
- **A label that wraps its own input must not also wrap a button** — tapping the button focuses the field. Keep Clear a sibling. A mono/uppercase label also inherits into the input; reset `text-transform`/`letter-spacing` there.
- **History stat presentation**: When streak is 0 but something was trained, render `Nd ago / Last trained` instead of `0d / Current streak` to avoid confusion.
- **BodyScreen staleness**: Shows `last logged Nd ago` rather than guarding the tap — re-logging unchanged weight is legitimate.
- **Session recap never locks**: `/history/$sessionId` is post-workout recap; sets can still be logged/edited after. Use "Review session" wording. Editing there is opt-in per exercise ("Edit sets"), one exercise at a time — the screen reads as a recap first. Any set edit invalidates `session-detail`/`sessions`/`session`/`today`/`records`/`trends`.
- **Zero-set sessions**: Visible in History with muted "started · nothing logged", but excluded from stats. Empty state has armed confirm to remove.
- **Warm-up toggle state**: Per-set UI state (`nextIsWarmup`), not derived. Reset on `logSet` success, dayId reset, and exercise switch via `focusExercise` wrapper.
- **Exercise swap details**: the swap panel lists `GET /api/exercises/:id/alternatives` and then `ExercisePicker` below it, so search and create are reachable mid-workout the same way they are in the builder (ISS-011). `swapTo` takes an `ExercisePick`, so both halves land in one handler. Catalog picks send no `kind` so the server resolves it from the catalog. Panel state is `swapFor` (exercise id), cleared on focus change.
- **`ExercisePicker` lives in `components/`**, shared by the program builder and the session screen; `pickFromAlternative` lives in `lib/exercise-pick.ts` so one mapping from `ExerciseAlternative` to `ExercisePick` serves both.
- **Every exercise can be swapped**: `canSwap` no longer requires `primaryMuscleGroup`. The picker below the suggestions is what gives an untagged exercise somewhere to go.
- **A mutation `onSuccess` must not close over a binding declared below the early returns**: `focusExercise` sits above the mutations for that reason.
- **TrendsScreen order**: Progress → Fuel adherence → Records (collapsed). Don't restore Records to top or un-collapse.
- **Trends exercise ordering**: `GET /api/trends/exercises` ordered by recency (`max(set_log.completed_at) desc`). Picker depends on this order — `data[0]` is default.
- **Un-logged fuel days are `null`**: `FuelHistoryDay.entryCount === 0` distinguishes "didn't log" from "ate 0 g". `BarChart` accepts `(number | null)[]` where `null` draws dashed placeholder.
- **Chart scrubbing**: Both charts scrub by pointer position (`clientX`), not per-mark hover. Touch support via `onTouchStart`/`onTouchMove`/`onTouchEnd`.
- **CSS naming**: `.ls`/`.ls.on` (generic toggle) vs `ls-*` (logged-set internals) are unrelated.

## Theming

- **Colour is addressed by role, never by hue.** `theme.css` exposes eleven
  tokens — `--bg`, `--surface`, `--surface-hi`, `--accent`, `--accent-deep`,
  `--accent-mute`, `--alert`, `--good`, `--text`, `--text-soft`, `--text-faint`
  — and nothing outside the palette blocks at the top of the file names a
  colour. The old hue names (`--marigold`, `--espresso`, `--cream`, `--taupe`,
  `--sage`, `--pomegranate`) are gone; reintroducing one makes the token a lie
  the moment the palette changes.
- **Shades and tints derive with `color-mix`**, e.g.
  `color-mix(in srgb, var(--accent) 12%, transparent)`. Never hardcode an rgba
  of a palette colour — it will not follow the theme. `rgba(0,0,0,…)` shadows
  and the `rgba(255,255,255,0.04)` inset are the deliberate exceptions.
- **Palettes are `[data-theme="…"]` blocks, not `:root`-only**, so a palette
  applies to any subtree. The Settings swatches rely on this: each swatch is an
  element carrying `data-theme`, so the preview *is* the palette rather than a
  duplicate of it. Keep new palettes as element-scoped selectors.
- **`--line`/`--line-hi` are declared on `:root, [data-theme]`**, not on `:root`
  alone. A custom property resolves its `var()`s on the element that declares
  it, so a root-only declaration would freeze the hairlines at the root palette
  and leave every swatch wrong.
- **Charts take CSS vars, not hex.** SVG `fill`/`stroke` accept `var(--accent)`;
  `LineChart`'s `color` prop defaults to `var(--accent)`. `BodyScreen`'s
  `METRICS` carry var strings for the same reason.
- **Selection is per device, in `localStorage` (`afya.theme`)** — no schema, no
  API, no account sync. `applyTheme` is called from `main.tsx` before the first
  render so the chosen palette paints instead of the default, and it also
  restamps the `theme-color` meta. Unknown or unreadable stored values fall back
  to `DEFAULT_THEME` (`graphite`).
- Adding a palette is a CSS block plus one entry in `THEMES` in
  `apps/web/src/lib/theme.ts`. Nothing else.

## Critical Implementation Conventions

- **DB changes**: Edit Drizzle schema, then `db:generate` + `db:migrate`. Never hand-edit `apps/api/drizzle/`.
- **drizzle-kit PK limitation**: Cannot drop Postgres primary key. Use `--custom` migration for the drop, ordered before the generated one.
- **Data backfills**: Ship via `--custom` migrations. Print values from TypeScript constants, guard with `WHERE <col> IS NULL`.
- **Breaking schema changes**: Rehearse against throwaway DB, not shared dev `afya` database.
- **Generated files**: Don't format/edit.
- **Code width**: Written at ~110 columns. Match surrounding style; don't run `pnpm format`.

## Testing

- **Vitest**: API test framework (`vitest run`). Tested modules import from `@afya/shared` type-only for cross-workspace resolution. Tests live beside code (`records.test.ts` next to `records.ts`).

## Audits

Structured audit reports at repo root: `DOMAIN_MODEL_AUDIT.json`, `BACKEND_ENGINEERING_AUDIT.json`, `UX_ACTIVE_WORKOUT_AUDIT.json`, `PRODUCT_LEAD_AUDIT.json`, `PRODUCT_STRATEGY_AUDIT.json`. See `BACKEND_ENGINEERING_AUDIT.json` for canonical schema.
