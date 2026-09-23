# Session handover — the mid-workout swap, both halves

Targeted session on **ISS-011** and **ISS-012**. Both resolved and committed to `main`.

## What shipped

### ISS-011 — the swap could only pick a suggestion (`c82e741`)

The session swap panel listed one thing: up to 12 same-muscle alternatives. Nothing else in the library, nothing in the 65-entry catalog, and for an untagged exercise no Swap button at all.

The program builder solved this three commits earlier (ISS-008), so the fix was to use the same component rather than invent a second idiom:

- `ExercisePicker` renders below the alternatives in the session swap panel, exactly as it does in `ProgramScreen`.
- It moved to `apps/web/src/components/ExercisePicker.tsx`, since two screens now use it.
- `pickFromAlternative` moved into `lib/exercise-pick.ts`. One mapping from `ExerciseAlternative` to `ExercisePick`, not one per screen.
- `swapTo` takes an `ExercisePick`, so the suggestions and the search land in one handler.
- `canSwap` dropped its `primaryMuscleGroup` requirement. With a picker present, an untagged exercise has somewhere to go.

### ISS-012 — a swapped-in exercise could never be finished (`0e2777a`)

This was reported as "I want a button that says complete workout". It was not a missing control. A substitute joined as an **ad-hoc** exercise, `isExerciseDone` requires `fromProgram`, and `pipCount = max(targetSets, logged + 1)` with `targetSets: 0` offers exactly one more empty pip forever. The replaced exercise also stayed in the day, unperformed. One swap made the session unresolvable.

The fix models the swap instead of patching the arithmetic:

- New table `session_substitution (sessionId, programExerciseId, exerciseId)`, unique per slot — migration `0016_fresh_black_tarantula.sql`.
- `buildDayExercises` renders a substituted slot **as** the substitute, carrying the slot's own targets, rest, note, section and superset group, with `fromProgram: true`. `isExerciseDone` and `pipCount` are untouched; there was nothing wrong with them.
- `TodayExercise` gains `programExerciseId` and `substitutedFor`; the session screen reads "Instead of Back Squat" under the lift.
- `POST /api/sessions/:id/substitutions`. Naming the slot's own exercise deletes the row — that is the undo, and the only one. A substitute another slot already holds is refused, because two slots sharing an exercise would share one pool of logged sets.
- Sets logged against the planned exercise *before* the swap surface as ad-hoc. They were performed.
- The program day is untouched: next week plans what it planned. That was the design decision ISS-012 flagged and it survives.

## Decisions made

1. **A program slot must never get an ad-hoc stand-in.** That is the whole defect, and it is now recorded in `CLAUDE.md` under "Mid-workout Swaps (session substitutions)".
2. **Direction 1 only.** ISS-012 offered three directions and flagged the choice. Direction 1 (carry the target over) is what the report actually describes, so that is what shipped — durably, in the database, rather than as mounted-scope client state that a reload would lose.
3. **`ExercisePicker` did not replace the separate "Add an exercise" panel.** Its `KIND_OPTIONS` has no `distance`, and a freeform session is exactly where a ride gets logged. Folding it in would have been a regression.

## Runtime verification

Against the running API with the seeded demo account, not only by reading:

- Substituting Bulgarian Split Squat for Back Squat returned `insteadOf Back Squat | targetSets 4 | targetReps 5 | rest 180`, and Back Squat left the day.
- Four logged sets made it read **done 4/4** — the reported symptom is gone.
- Substituting Back Squat back restored the slot and kept the four sets as an ad-hoc entry.
- `GET /api/programs` still showed Back Squat 4× in the Legs day throughout.
- Substituting Leg Press, already in that day, was refused by name.

Also clean: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm --filter @afya/api test` (35 passed), `db:migrate` against the local database.

## What's next

Two issues filed out of this work, both with verified `file:line` references:

- **ISS-013** (medium) — the session's "Add an exercise" panel still browses unfiltered chips and creates by bare name, i.e. the ISS-008 defect in the one place it survives. Blocked on a decision: does `distance` join `ExercisePicker`'s kind options (which changes the program builder too), or does the add panel keep its own kind selector beside the picker?
- **ISS-014** (medium) — a freeform session still cannot read as finished: an ad-hoc exercise has no set target and there is no finish action. Directions 2 and 3 from ISS-012's report (editable set count, "Finish workout" button). This is a design change, since `CLAUDE.md` records the `fromProgram` gate as deliberate for freeform.

The working tree still carries pre-existing untracked files from earlier sessions (`ARCHITECTURE.md`, `PROJECT_RECOMMENDATIONS.md`, `UX_ACTIVE_WORKOUT_AUDIT.json`, several handovers, `.story/lessons/L-003.json`, `L-004.json`) plus unstaged edits to `.story/issues/ISS-008.json` and `.story/lessons/L-001.json`. None of it was touched here.
