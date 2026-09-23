# Session — four fixes, and the first runtime verification in four sessions

Four items shipped across three autonomous sessions, then a manual verification pass
that exercised all of them against a running API, a real Postgres, and a real browser.
Each autonomous session wrote its own handover; this one covers the whole arc and,
mainly, **what running it actually proved**.

| Item | Commit | What changed |
|---|---|---|
| ISS-008 (high) | `cd09902` | Program builder searches the library + catalog; swap in place |
| ISS-007 (high) | `836447c` | Section/superset editing is a 44px control and a labelled panel |
| ISS-010 (med) | `5fdd98f` | Quick-add chips state the calories they log |
| T-002 | `022f422` | Double tap can no longer log a set twice |

## The verification pass is the part worth reading

Three prior handovers each flagged the same gap: nothing had been run. That gap is now
closed, and closing it changed what we know.

**The decisive test.** Two clicks dispatched in a single JavaScript tick on the real pip,
in Chromium, against the real database:

```
POSTs to /sets: 2          <- the client guard did NOT stop the second
  #1 HTTP 201  setId=28fc9d8b  key=eea8119e
  #2 HTTP 200  setId=28fc9d8b  key=eea8119e
set_log: 2398 -> 2399      <- one row
```

Both requests went out. `logSet.isPending` is React state read from a closure and cannot
update between two clicks in the same tick, exactly as the plan predicted. **The
idempotency key is the only thing that stopped a second row**, and it worked because both
taps computed the same slot and therefore sent the same key.

That is the precise defect plan review round 1 caught. Had the key been minted per tap —
as the first draft had it — this test writes two rows and the bug ships looking fixed.

**Also verified end to end:** 5 concurrent requests with one key → one 201, four 200s, one
row; distinct keys still insert; keyless still inserts (old behaviour intact); malformed
keys (number, whitespace, 129 chars) fall back to keyless rather than erroring;
`GET /api/exercises/catalog` 200; in-place swap keeps row id, position, targets, section
and superset while retagging from the catalog; picker filters and ranks correctly; the
grouping control measures 232×44 with 44px fields; one panel open at a time holds across
rows. No console or page errors in any run.

## Corrections this session produced

- **The catalog holds 65 entries, not 67.** ISS-008 claimed 67 and I repeated it in my own
  resolution without checking. Corrected in the ledger. L-001 reinforced — this is exactly
  the rule it states.
- **The first browser script "passed" against an empty page.** Sign-in was skipped because
  the inputs are labelled rather than placeholdered, so every later assertion read 0 or
  `[]` and reported no errors. See L-003.

## Environment notes for the next session

- Postgres `afya-postgres` (5435) is up; migrations through `0015` are applied and
  `set_log_session_idem_idx` is live.
- An API dev server (3001) and Vite (5174) were **already running** before this session; a
  second `pnpm dev` hits `EADDRINUSE`. Check `lsof -ti:3001` before starting one.
- **Playwright lives outside the repo**, in the session scratchpad — `package.json` and the
  lockfile are untouched. Chromium is in the shared `~/Library/Caches/ms-playwright`, so it
  survives. If browser verification should be a repeatable part of this project rather than
  an ad-hoc capability, that is an undecided call worth a ticket.
- Demo login: `afya@local.dev` / `afya-dev-123`. The start screen offers day cards, not a
  Start button.
- All test data was removed: `set_log` and `workout_session` are back to their pre-session
  counts (2398 / 88) and zero keyed rows remain.

## Decisions taken, so they are not relitigated

- **ISS-010 was display-only.** The chips should keep logging calories; the owner said so
  explicitly on the issue before work started. The title reads like the behaviour was the
  defect, which is why the decision is recorded there.
- **ISS-007's global "show advanced fields" idea was declined.** Per-row disclosure already
  removes the clutter, and a global toggle would hide a field that has a value.
- **The T-002 guard is per-mutation, not per-slot.** During a superset the next member's pip
  tap is swallowed for a round trip. Left as shipped: a per-slot guard would allow two slots
  in flight, which the single `createdSessionId` ref is not built for. `.pips.logging` makes
  the block visible.
- **The slot-key map must stay mounted-scoped to `SessionScreen`.** Sets can also be deleted
  from `SessionDetailScreen`; route unmount is what covers that. Hoisting the map to a
  context would silently reintroduce the replay. Recorded in CLAUDE.md.

## What's next

1. **T-003** (confirm before deleting a logged set) and **T-004** (compare against the
   matching set number) are next in phase order for `trust`.
2. **ISS-001** (optimistic updates) now interacts with T-002 — an optimistic insert needs to
   reconcile against a 200 replay, not just a 201.
3. **ISS-002** (8px pip tap target) is the last untouched half of the pip: T-002 made a
   swallowed tap legible but did not make the target bigger.
4. An API integration harness is still absent. T-002's correctness rests on a Postgres
   unique index that the pure-module vitest suite cannot reach; it was verified by hand this
   session and nothing re-checks it. Worth a ticket if more database-level invariants are
   coming.
5. Untracked at repo root, unrelated to all of the above: `ARCHITECTURE.md`,
   `PROJECT_RECOMMENDATIONS.md`, `UX_ACTIVE_WORKOUT_AUDIT.json`.
