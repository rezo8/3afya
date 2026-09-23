# Session — ISS-008: program builder exercise search

Targeted autonomous session, one item: **ISS-008 (high)**, resolved and committed as `cd09902`.

## What the defect actually was

Adding an exercise to a program day offered two affordances, neither a picker:

- a text field whose submit handler looked for an **exact** case-insensitive library name and, failing, silently POSTed a new exercise. A variant spelling created a duplicate row the catalog never tagged (tagging is exact-match on create), so it carried no muscle group, no equipment, and no alternatives forever after.
- a `slice(0, 8)` of the library with no query behind it. Past eight exercises the rest was unreachable by browsing, and the 67-entry curated catalog was reachable only by typing a name character-exact.

Replace was absent entirely: remove, retype at the end of the day, then walk the row back into position one `↑` tap at a time, losing section and superset on the way.

## What shipped

**API**
- `GET /api/exercises/catalog` (`apps/api/src/routes/exercises.ts`) — the curated entries, alphabetical, same for every user.
- `PATCH /api/programs/day-exercises/:id` accepts `exerciseId`, validating ownership and non-archived status. The swap is **in place**: position, section, superset group, targets and rest all survive. A slot swapped onto a `time` exercise with no hold gets `DEFAULT_HOLD_SEC`, a new constant the add path now shares.
- `CatalogExercise` moved to `@afya/shared`; `exercise-catalog.ts` imports it rather than declaring a twin.

**Web**
- `lib/exercise-pick.ts` — the pure logic, under test (14 cases). `queryTokens`/`matchesQuery`: every token must be a substring of the name, any order, case-insensitive, **deliberately not fuzzy**. `buildPickerOptions`: pickable library → what the day already holds (listed, disabled, "in this day") → catalog entries the user lacks (badged "new"). `isNewName` decides whether creating is offered at all.
- `screens/program/ExercisePicker.tsx` — one combobox over that list, taxonomy chips per row, 12-result cap with a "keep typing to narrow" note, and **"Create <typed>" as an explicit last row**, shown only when nothing already answers to the name. The kind selector lives there alone: picking something that exists already knows its kind.
- `ProgramScreen` — exact-match-else-create is gone, replaced by `resolveExerciseId` over a discriminated `ExercisePick` (`library` | `catalog` | `new`). A catalog pick sends no `kind` so the server tags the row from the entry. Each program exercise gained a `Swap ⇄` control opening the alternatives list (same endpoint SessionScreen uses) with the picker below as the escape.
- `TaxonomyTags` extracted from SessionScreen into `components/TaxonomyTags.tsx`; both screens now render chips from one place.
- CSS: `.expick-*` family, `.pex-actions`/`.pex-swap`.

## Decisions worth remembering

- **Creating had to stop being the fallback.** That single change is the duplicate-library fix; search alone would not have prevented it.
- **No fuzzy matching.** `"db"` does not find "Dumbbell". A wrong match here is the same failure `findCatalogExercise` refuses to make: it would present a name the user did not mean as though the app understood them. A doc comment claiming otherwise was written and then corrected against the test.
- **The catalog route carries no user data**, so it is cached with `staleTime: Infinity` on the client.
- Recorded in `CLAUDE.md` under a new "Exercise Picking (program builder)" section.

## Verification

`pnpm typecheck`, `lint`, `test` (49 web + 35 api), `build` — all pass. **Not** verified at runtime against a live database or in a browser; the swap PATCH and the catalog route have no HTTP-level test (this repo's suite is pure-module only).

## What's next

- Exercise the new picker and swap against a running API — the one gap above.
- Still untracked at repo root and unrelated to this session: `ARCHITECTURE.md`, `PROJECT_RECOMMENDATIONS.md`, `UX_ACTIVE_WORKOUT_AUDIT.json`, and the previous handover file.
