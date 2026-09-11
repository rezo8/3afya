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

### Exercise Alternatives
- **Equipment-first ranking**: `rankAlternatives` puts different equipment before same equipment within each half (library then catalog). This is the whole point — you look for a substitute because the machine is taken.
- **Untagged source = empty result**: An exercise with no `primaryMuscleGroup` returns `[]` rather than guessing.

### Exercise Deletion
- **`setLog.exerciseId` is `onDelete: "restrict"`**: Postgres itself refuses deletion if any sets reference the exercise. The handler checks first and soft-deletes via `archivedAt` if history exists.
- **Resurrection on name collision**: Because `(userId, name)` is unique, `POST /api/exercises` with an archived exercise's exact name clears `archivedAt` rather than erroring.
- **`programExercise.exerciseId` is `onDelete: "cascade"`**: Template references are disposable; historical training data is not.

### Session Immutability
- **No session-exercise join table**: Exercises belong to a session iff they have ≥1 logged set. Ad-hoc exercises are surfaced by `buildDayExercises` with `fromProgram: false`. This keeps sessions immutable records and programs reusable templates.
- **Day name snapshot**: `workoutSession.dayName` is set at creation (both paths) and read as stored snapshot → live join → null. Reading the join first would re-break history on a rename.
- **Two latest-session queries**: `rotationState` runs both `latestSession` (any kind, for resume) and `latestSessionWithSets` (with sets, for rotation). Empty sessions must not advance rotation.
- **Empty session deletion**: `DELETE /api/sessions/:id` refuses once the session has any `set_log` row.
- **`POST /api/sessions` is find-or-create per (day, calendar day)** via `todaySessionForDay` — a second POST with the same `dayId` returns the existing row with 200 rather than inserting. It's not a concurrency guarantee.
- **`nutritionTarget` is append-only**: `PUT /api/fuel/target` INSERTs; nothing ever updates or upserts it. This lets historical adherence be scored against the target in force *then*.
- **`isWarmup` filtering**: `apps/api/src/records.ts` filters warm-ups internally. Every caller must include `isWarmup` in its `RecordSet`-shaped query/object or silently treat all sets as working sets.
- **Frequent fuel labels**: Derived from user's own entries only — exact match on `lower(trim(label))`, no food catalog, no fuzzy matching.

## Critical Web Implementation Rules

**For general web architecture, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).**

- **Rest timer context**: The app's one React Context is mounted in `AppLayout` (not `SessionScreen`) so it survives navigation. Follow the outer-provider/inner-consumer split pattern for any future shell-level context.
- **SessionScreen focus is derived**: `activeId` = override if still valid/incomplete, else first incomplete in program order. `completeSet()` must stay pinned on the just-logged exercise until that exercise (or both superset members) is done.
- **Extra sets pin focus**: `completeSet()` tests `loggedSets.length >= targetSets` before superset logic and re-pins `override`, so extra sets never advance focus.
- **Session creation ref**: `SessionScreen` stores the id of any session it creates in a ref because a failed set-POST doesn't invalidate. The ref is cleared on success.
- **`isExerciseDone` is the single source of truth**: Shared by `SessionScreen` and `StartScreen`. Don't re-inline it — the point is the two screens can't disagree.
- **Client-side rotation advance**: `StartScreen` owns moving "NEXT UP" past a finished day because the API keeps returning today's day. If rotation ever advances server-side, delete the client rule.
- **Fuel target invalidation**: Target editing must invalidate both `["fuel","today"]` and `["fuel","history"]` — TrendsScreen scores against `FuelHistory.target`.
- **Day letters**: Use index in `program.days` (`String.fromCharCode(65 + i)`), never `programDay.position` (not re-packed on delete).
- **Armed confirm pattern**: Two-tap delete with `DELETE_ARM_MS` (4s) window. Used for delete day, remove exercise, remove empty session. Reuse this shape rather than modals.
- **Program builder sizing**: Controls sized against 390px budget. `.ord`, `.ctl button`, `.pex-del` use `flex: none`. Re-do arithmetic before adding controls.
- **Placeholder-shown**: `.pex-tag-in` empty state uses `:placeholder-shown` — the `placeholder` attribute is load-bearing.
- **History stat presentation**: When streak is 0 but something was trained, render `Nd ago / Last trained` instead of `0d / Current streak` to avoid confusion.
- **BodyScreen staleness**: Shows `last logged Nd ago` rather than guarding the tap — re-logging unchanged weight is legitimate.
- **Session recap never locks**: `/history/$sessionId` is post-workout recap; sets can still be logged/edited after. Use "Review session" wording.
- **Zero-set sessions**: Visible in History with muted "started · nothing logged", but excluded from stats. Empty state has armed confirm to remove.
- **Warm-up toggle state**: Per-set UI state (`nextIsWarmup`), not derived. Reset on `logSet` success, dayId reset, and exercise switch via `focusExercise` wrapper.
- **Exercise swap details**: Catalog-only alternatives created with `createEx.mutateAsync({ name })` and no `kind` so server resolves from catalog. Panel state held as `swapFor` (exercise id), cleared on focus change. Taxonomy tags use shared `TaxonomyTags` component.
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
