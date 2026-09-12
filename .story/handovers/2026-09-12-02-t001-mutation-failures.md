# Session handover — T-001, surfacing failed writes

Collaborative session. T-001 shipped as `5afaa18` on branch `feat/surface-mutation-failures`, one commit ahead of `main`, not pushed, no PR. Ticket marked complete in that commit.

## What was wrong

Twenty-three mutation declarations across five screens; nineteen had no `onError` at all. A failed write left the UI showing the value you just typed with nothing reported — it read as saved until a reload. ProgramScreen was the worst: twelve writes, no error surfacing, and no import of `ErrorBanner` anywhere in the file.

## What was built

`apps/web/src/lib/query/use-mutation-error.ts` — `useMutationError()` holds one failure slot per screen; `useTrackedMutation(slot, options)` wraps `useMutation` and reports into it. Adopted in all five screens, including SessionScreen and FuelPanel, which already had the pattern inline.

RULES 9 drove the shape: SessionScreen and FuelPanel were already two verbatim copies (seven `onError` closures between them), and the rule says deduplicate the moment a second copy exists rather than copy it a third time. The diff removes more than it adds — 199 insertions against 90 deletions including the new hook, test, and docs; the five screens alone are net negative.

`isRetryableError` in `lib/api/errors.ts` reads the `status` that `ApiError` has carried since it was written and that nothing in `apps/web` had ever read. Retry is omitted on 4xx except 408/429; a rejected `fetch` never becomes an `ApiError`, so anything else stays retryable.

## Two bugs found that the ticket did not know about

Both on SessionDetailScreen, both from the same root cause — no `onError`, so the failed variables were never captured, and the call sites sit inside a doubly-nested `map` unreachable from the banner's position.

1. **The Retry button did not retry.** `onRetry` called `invalidateSets()`, which refetches queries and never re-issues the failed PATCH/DELETE. `isError` stayed true, so it did not even dismiss. It looked like error handling and was not.
2. **The wrong error could display.** `editSet.error ?? deleteSet.error` always preferred the edit, so a failed delete after an earlier failed edit showed the stale edit message.

`removeSession` was that screen's only working retry, purely because `data.id` happened to be in scope where the banner rendered. That is the clearest statement of why the variables have to come from `onError`.

## The finding worth carrying forward

**A mutation cannot name itself inside its own declaration.** `onError: onErrorFor(() => updateEx)` makes `updateEx`'s type depend on its own initializer; TypeScript resolves that to implicit `any`, which this project bans. Caught during planning, before five screens were written against a shape that would not compile. The wrapper hides the self-reference behind an internal ref, so the caller never writes it. Recorded as L-002.

Also: TanStack v5.101 mutation callbacks take **four** arguments (`data, variables, onMutateResult, context`), not the three most examples show. The wrapper spreads rest args rather than naming them positionally, so an upgrade cannot silently drop the last one.

## Ticket metadata was wrong, and now is not

T-001 claimed "13 mutations in ProgramScreen, BodyScreen has 2" and cited RULES 7. Actual: **12** in ProgramScreen, **1** declaration in BodyScreen (rendered 3× from `METRICS`, so 3 runtime instances — "2" matched neither), and the governing rule is **RULES 8**. It also said SessionDetailScreen "offers no retry" when it offers a broken one. Corrected in the ticket before work started. This is what L-001 was written about, and it reproduced within a day of being written.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm build` clean. 39 tests pass — 35 api, 4 new in web.

Probed the **running API** for real statuses rather than assuming: writes return `400` with a human message (`"A program name is required."`), `404`, and `401` on an expired session. All 4xx, none fixable by a second identical request, so all correctly hide Retry. A probe program was created and deleted; the dev DB is as it was.

**Not verified: the browser.** No browser tool was available this session, so the banner rendering, the retry closure firing, and the per-card BodyScreen isolation were never seen running. That is the gap in this work. Worth ten minutes with `pnpm dev` and the API stopped.

## Decisions taken with the user

- Extract a shared hook rather than copy the pattern (RULES 9).
- Hide Retry on 4xx rather than always offer it.
- BodyScreen reports per card, not one lifted banner — the mutation lives in `MetricCard` and the error belongs next to the button that failed.

## Additions worth a second opinion

- **Vitest was added to `@afya/web`** (devDep + `test` script) so `isRetryableError` could be tested, mirroring the api package exactly. Web had no test runner before. Justified by RULES 11 — it is a pure function deciding whether a button appears — but it is a new capability in that package and easy to drop if unwanted. Note `turbo.json` has no `test` task and root `package.json` has no `test` script, so tests still run per-package (`pnpm --filter @afya/web test`). Wiring turbo would be a separate change.
- **SessionDetailScreen lost its second banner.** `removeSession`'s error used to render inside `.sd-empty` next to its button; with one slot per screen it now shows in the single banner under the stat row. Consistent with the other screens, but it is a small UX move.

## Corrections to the ticket's own claims

The ticket said adopting the hook would fix FuelPanel's stale-banner problem (it has no reset effect, unlike SessionScreen's `targetKey` one). **It does not.** The hook adds no reset-on-unmount; FuelPanel's behaviour there is unchanged. A failure clears on the next success, as before. Left alone deliberately — FuelPanel has no route key to reset against — but it should not be recorded as fixed.

## State

- Branch `feat/surface-mutation-failures`, one commit ahead of `main`, unpushed.
- `main` itself is still ahead of `origin/main` from prior sessions.
- Uncommitted and deliberately so: `.story/` records from the previous session (T-041/042/043, ISS-007, `lessons/`) plus the long-untracked `ARCHITECTURE.md`, `PROJECT_RECOMMENDATIONS.md`, `UX_ACTIVE_WORKOUT_AUDIT.json`.
- An API dev server is running on port 3001 from before this session; a spawn attempt hit EADDRINUSE and was harmless.

## Suggested next

**ISS-007**, and re-test it before building anything. Its "superset edits don't stick" report had three candidate causes and one of them was this ticket — a silent PATCH failure on ProgramScreen leaving an uncontrolled input showing the new value. That path now reports. If the edits were failing silently, the issue shrinks to a sizing fix (~25px target in a 44px app); if they still do not stick, the cause is the uncontrolled `defaultValue` with a stable `key` that never re-syncs from the server, which is a different fix entirely.

The browser verification above is the other loose end.
