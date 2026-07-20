# 3afya — feature roadmap TODO

Ordered backlog to make 3afya competitive with Hevy for **individual use**.
Focus areas: Analytics & PRs, Logging depth, Nutrition & body. Each item gets
its own intent-driven planning + implementation pass before it's checked off.

Full rationale + implementation approach for every item lives in the plan:
`~/.claude/plans/what-are-some-features-reactive-blanket.md`

Legend: effort **S / M / L** · areas: `analytics` `logging` `nutrition/body`
Out of scope: social feed / following / sharing (solo depth is the differentiator).

---

## Build order

### Tier 1 — flagship
- [x] **1. Personal Records (PRs) + "new record" moments** · `analytics` · M ✅ done
  - All-time bests per exercise + a live "🏆 New PR" banner + badge at log time;
    PR tags in session detail; a Records card on Trends. Computed on the fly (no
    table). Weighted tracks est 1RM / heaviest / best volume; reps → most reps;
    time → longest hold. Helpers in `apps/api/src/records.ts`.
  - More accurate once #4 (warmup flag) lands (exclude warmups from PR math).
- [x] **2. Body-metric logging UI + body dashboard** · `nutrition/body` · S–M ✅ done
  - New **Body** tab/screen: log weight / resting HR / sleep (stepper + trend line
    per metric) against the existing `routes/metrics.ts`. Bodyweight chart moved
    out of Trends. (Body fat available in backend but not surfaced, by choice.)
  - Also added: **edit program name** (PATCH /api/programs/:id) in the builder.
- [ ] **3. Muscle-group taxonomy + shipped exercise catalog** · `logging` · M–L · FOUNDATIONAL
  - Add `muscleGroup` (+ optional `equipment`) to `exercise`; ship a curated
    catalog so real users don't start empty. Unlocks #5. Needs a migration.

### Tier 2 — high value
- [ ] **4. Richer sets: warmup flag, set type, RPE, per-set note** · `logging` · M
  - Warmup flag is the priority — warmups currently distort 1RM/PR/volume.
    Adds columns to `set_log` (migration); filter `working` sets in all math.
- [ ] **5. Muscle-group volume + stats dashboard** · `analytics` · M · needs #3
  - Weekly volume/sets per muscle, workouts/week, top movements, optional heatmap.
- [ ] **6. Whole-workout volume trend + trend time ranges** · `analytics` · S–M · quick win
  - Session-volume line + 4w/12w/1y/all toggle. Wire fuel's existing `days` param.

### Tier 3 — deepening + loop-closers
- [ ] **7. Fuel: history view + editable targets** · `nutrition/body` · S
  - 30/60-day adherence + a target-edit UI. `PUT /target` exists with no UI.
- [ ] **8. Workout duration** · `logging` · S
  - Show time per workout (derive from set timestamps, or add `endedAt`).
- [ ] **9. Surface warmup/cooldown + supersets *during* the session** · `logging` · S
  - Data is already built + passed to the session; the screen ignores it today.
- [ ] **10. 1RM / plate calculator utilities** · `analytics`/`logging` · S · nice-to-have

### Later — polish & ownership (de-prioritized)
- [ ] Installable PWA (offline logging, home-screen icon, background rest-timer alerts)
- [ ] kg/lb unit preference (currently hardcoded "lb")
- [ ] Settings/account screen (change password, delete, home for units/targets/export)
- [ ] CSV/JSON data export
- [ ] Password reset / email verification
- [ ] First-run onboarding

---

## Dependencies
- #5 (muscle volume) **requires** #3 (muscle taxonomy).
- #1 (PRs) and all volume/1RM math are **more accurate after** #4 (warmup flag).
- #2, #7, #8, #9 are largely independent quick wins (backend mostly present).
