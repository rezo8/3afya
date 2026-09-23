# Session — T-003, confirm before removing a logged set

Collaborative session, one ticket, committed to `main` as `2c1a725`.

## What shipped

The `.ls-del` × that removes a logged set was a ~24px target with no confirmation, in both `SessionScreen` and `SessionDetailScreen`. Both now use the two-tap armed confirm that delete-day and remove-exercise already had, on a 44px target.

- `apps/web/src/lib/use-armed-confirm.ts` — `useArmedConfirm<Target>()` holds one armed target, self-disarms after `DELETE_ARM_MS` (4s), and exposes `arm` / `disarm`. The three hand-rolled `useState` + `useEffect(setTimeout)` copies (ProgramScreen ×2, SessionDetailScreen ×1) and the two duplicate `DELETE_ARM_MS` constants are gone; everything arms through the hook.
- `apps/web/src/components/RemoveSetButton.tsx` — the shared control, used by both screens the way `SetEditor` is. Unarmed it is the × with `aria-label="Remove set"`; armed it reads "Remove?". **Both faces are disabled while the delete is pending**: the arm window can expire mid-request, and a live × on a row being removed would let a second tap DELETE a set that is already gone (404, then a Retry for nothing). `aria-live="polite"` so the state change is announced.
- `theme.css` — `.ls-del` is 44×44 with `margin: -4px -8px -4px 0` so the hit area overhangs the row padding and the row stays as short as the 24px steppers. `.ls-del.armed` grows with the copy, same shape as `.pex-del.armed`.
- Each `deleteSet.onSuccess` calls `disarm()`.

## Verification

Chromium against the dev server (Vite 5174 was already up; API 3001 started for the session and stopped after), demo account, 390px viewport:

- History → Edit sets: `.ls-del` box **44×44**, row height unchanged at 71px armed or not.
- One tap → `Remove?` / `ls-del armed`; after 4.5s → back to ×.
- Arm row 1 then row 2 → only row 2 armed.
- Program builder after migration: delete-day arms with its stakes text and disarms at 4s; remove-exercise arms and only one is armed at a time.
- **Zero DELETE requests** fired across both runs; no page errors.

Also clean: `pnpm typecheck`, `pnpm lint`, `pnpm build`, web tests 65, api tests 35.

## Review

Seven lenses ran on the diff (`lens-mue21r6e`). Verdict `revise` on one major. Dispositions:

- concurrency minor (unarmed × live during pending) — **fixed**, `disabled` on both branches.
- clean-code minor (ProgramScreen still hand-rolled the timer) — **fixed**, migrated.
- accessibility suggestion (no live region) — **fixed**, `aria-live="polite"`.
- accessibility suggestion (4s window not adjustable, WCAG 2.2.1) — **not taken**; `DELETE_ARM_MS` is the project's existing window and lengthening it is a design call, now in one place if it is ever made.
- test-quality major (no test for the hook) — **not written**. The hook is `useState` + `setTimeout`; RULES.md rule 11 says test the math, not the plumbing, and there is no renderer to test it with anyway. The real gap is the missing harness, filed as **ISS-015** (low) with code refs — two earlier handovers had already called for that ticket.

## Environment notes

- The Playwright install from the 2026-09-19 scratchpad was gone; reinstalled into this session's scratchpad (`scratchpad/pw`, `npm i playwright@1`, Chromium from the shared cache). Not in the repo. The two check scripts (`check.mjs` history, `program-check.mjs` builder) live there and die with the scratchpad — which is what ISS-015 is about.
- API on 3001 was **not** running at session start; it is stopped again. Vite on 5174 was running before and still is.
- Untouched pre-existing working-tree noise: unstaged `.story/issues/ISS-008.json`, `.story/lessons/L-001.json`; untracked `ARCHITECTURE.md`, `PROJECT_RECOMMENDATIONS.md`, `UX_ACTIVE_WORKOUT_AUDIT.json`, `.story/lessons/L-003.json`, `L-004.json`, and the older handovers.

## What's next

1. **T-004** — compare against the matching set number — next in `trust` phase order.
2. **ISS-002** — the 8px pip is the last unguarded small target on the set row; `.ls-del` is now 44px, the pip is not.
3. **ISS-015** — decide whether the browser check becomes a repeatable part of the repo.
4. The three decision-gated issues still wait on the owner: ISS-013 (`distance` in `ExercisePicker`), ISS-014 (finish a freeform session), ISS-004 (CORS docs disagree).
