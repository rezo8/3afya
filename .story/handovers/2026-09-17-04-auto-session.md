# Session — ISS-010 + T-002

Targeted autonomous session, two items, both landed.

| Item | Commit |
|---|---|
| ISS-010 — quick-add chips show protein but silently add calories | `5fdd98f` |
| T-002 — guard against double-logging a set | `022f422` |

## ISS-010 — a display fix, and only that

The owner settled the ambiguity before the session started, on the issue itself: the
chips SHOULD keep adding calories; only the label was wrong. Worth noting because the
issue's own title ("silently add calories") reads like the behaviour was the defect, and
a session starting cold could easily have removed calories from what a chip logs.

- `fuelMacroSummary(proteinG, calories)` in `lib/fuel.ts` renders `30p · 200kcal`.
- A zero macro is omitted. After ISS-009 let a food declare only one of its numbers,
  `0p · 5kcal` states something true about black coffee that reads like a missing value.
- The "Logged today" row now uses the same formatter instead of its own inline copy —
  both surfaces answer "what is this food worth", which is one piece of knowledge.
- 5 tests.

## T-002 — three plan-review rounds, and they earned their keep

This is the part worth reading. The plan was reviewed three times and **the first two
rounds each caught a defect that would have shipped a fix that did not fix the bug.**

**Round 1.** The key was generated inside `completeSet()`, i.e. per tap. Two taps would
have sent two different keys, Postgres would have seen no conflict, and the unique index
would never have fired — for the exact bug the ticket names. The server half would have
protected only the retry path while looking like it protected both.

**Round 2.** The fix for that leaked in both directions, and both obvious rules were
wrong. Clearing the key map on log success reopens the bug one RTT later: `onSuccess`
only invalidates, so `loggedSets.length` stays stale while `isPending` is already false.
Never clearing breaks deletes: `DELETE /sessions/:id/sets/:setId` renumbers the
remaining sets (`sessions.ts:490-497`), so a retained key names a slot that now means
something else and a genuinely new set replays a surviving row — silently not logged,
which is worse than the duplicate.

**Round 3.** Approved, after establishing that the map's mounted scoping is load-bearing
rather than stylistic: sets can also be deleted from `SessionDetailScreen`, which shares
no state with `SessionScreen`; what covers that is route-sibling unmounting. Hoisting the
map to a module singleton or an `AppLayout` context — the obvious next refactor, and the
one the rest timer already had done to it — would silently reintroduce the replay.

### What shipped

- `set_log.idempotency_key`, nullable, `uniqueIndex(session_id, idempotency_key)`,
  migration `0015`. NULLs distinct by default, so keyless and pre-existing rows still
  insert; no backfill.
- Handler: `onConflictDoNothing` → replay the original row (200, PRs recomputed) → 409 if
  a concurrent delete took it. A malformed key is treated as keyless, not rejected: the
  set happened, and refusing it to punish a bad field loses the thing worth keeping.
  All ten `row!` assertions are gone, replaced by one `if (!row)` narrowing.
- `lib/set-slot.ts`: `slotId`, `keyForSlot`, `newIdempotencyKey` (with a non-secure-context
  fallback — `crypto.randomUUID` is undefined on a phone hitting the dev server over the
  LAN, and without it logging a set would throw rather than degrade). 12 tests.
- `completeSet()` guards on `isPending`; the pip row gains `.logging` so a swallowed tap
  is legible.
- `IDEMPOTENCY_KEY_MAX` lives in `@afya/shared`, so the client minting keys and the
  server validating them read one number.

### Known trade, recorded rather than hidden

`logSet.isPending` guards the whole mutation, not the slot, so during a superset the next
member's pip tap is swallowed for a round trip. Left as shipped: a per-slot guard would
allow two slots in flight at once, which the single `createdSessionId` ref is not built
for. `.pips.logging` at least makes the block visible.

## Process note

Codex was unavailable for every review (binary not installed); all four rounds ran
through agent review, and each verdict's central claims were re-verified against the code
before being acted on — which mattered once: round 2's prescribed fix ("retire a key when
the server confirms the slot") was unnecessary, since `setNumber` is always
`loggedSets.length + 1` and a confirmed slot cannot be recomputed while sets accumulate.
The simpler correct rule shipped instead.

## Verification

`pnpm typecheck`, `lint`, `test` (65 web + 35 api = 100), `build` — all pass at each gate.

**Not verified at runtime, and the gap is now three sessions deep.** Nothing in ISS-008,
ISS-007, ISS-010 or T-002 has been exercised against a running API or in a browser. The
idempotency path is the first of these whose correctness rests on database behaviour
rather than on reading, and the repo has no HTTP or DB test harness to reach it — the
unique index is enforced by Postgres, which is the strongest place for it and the one
place this suite cannot see.

## What's next

1. **Run it.** `docker compose up -d` → `db:migrate` → `pnpm dev`. Log a set, double-tap a
   pip, delete a set and log again. That last sequence is the one the review rounds were
   about.
2. An integration harness for the API is real work and its own ticket — worth filing if
   more database-level invariants are coming.
3. Ledger next: T-003 (confirm before deleting a logged set), T-004 (compare against the
   matching set number), ISS-001 (optimistic updates), ISS-006 (fuel totals survive local
   midnight).
4. Still untracked at repo root, unrelated: `ARCHITECTURE.md`, `PROJECT_RECOMMENDATIONS.md`,
   `UX_ACTIVE_WORKOUT_AUDIT.json`.
