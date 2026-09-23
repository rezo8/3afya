# Session: fuel zero-amount fix, and the backlog behind it

## Shipped

**ISS-009 (resolved, pushed)** — Fuel refused any food whose protein and calories
were not both > 0, so olive oil, rice, bread, black coffee and diet soda could not
be logged; the workaround was typing 0.1, which put fiction into the protein total
and the adherence chart.

Fixed by modelling an amount as three states instead of a number, in a new
`apps/web/src/lib/fuel.ts` with `fuel.test.ts` beside it (the `lib/api/errors.ts`
pattern):

- `Amount = { blank } | { entered, value } | { invalid }`. Blank is deliberately
  NOT zero — "I have not said" and "it is none" were the same value under the old
  `numberOf()`, and separating them is the entire fix.
- `canLogAmounts()` — a food must declare at least ONE of its two numbers; both
  blank is still refused, and negatives/unreadable text are never numbers.
- `isUsableTarget()` keeps the old both-must-be-positive rule for the nutrition
  TARGET form. A target of 0 kcal is a mistake rather than a fact — a separate
  question, deliberately not swept along with this fix.

The API needed no change: `routes/fuel.ts:87-100` already clamped with
`Math.max(0, ...)` and both columns already default to 0. It was always a
frontend-only gate.

Verified: web typecheck, test (34 passed / 4 files), lint all clean. NOT verified
at runtime against a live API.

Commits `b95599c` and `6ad20dc`, pushed to main. That push also carried six older
unpushed commits (T-001, T-005, T-044, and the T-040 ledger), so the Cloud Run
deploy it triggered is larger than the fuel fix alone.

## Filed

- **ISS-008 (high, open)** — the program builder has no exercise picker. Full
  diagnosis and a five-point proposed fix are IN the issue; read it before
  planning, it is the plan's starting point.
- **ISS-010 (medium, open)** — quick-add chips show protein and silently add
  calories.
- **T-045..T-050** — the fuel roadmap, in intended order: portion multiplier,
  edit a logged entry, back-date, adaptive expenditure from weight trend +
  logged intake, weekly averages over daily pass/fail, personal food memory.
  T-048 is the one that changes the app's character; T-050 is deliberately NOT a
  food database, because the stated requirement is calories and protein, not
  exact meals.

## Next session starts here

`/story auto ISS-008`.

**Why this handover exists:** the previous session could not run it. Claude Code
had been launched from the umbrella directory
`/Users/rezo/programming/node/claude-node`, which has no `.story/`, so the
storybloq MCP server bound no project and registered only three tools
(`init`, `session_guard`, `status`) — no `storybloq_autonomous_guide`, and there
is no CLI equivalent. Launch Claude Code from `3afya/` itself and the full tool
set registers.

## ISS-008 notes for whoever plans it

The working counter-example is already in this repo: `SessionScreen.tsx:497-525`
renders a swap sheet from `GET /api/exercises/:id/alternatives`
(`routes/exercises.ts:92-135`, ranked by `exercise-alternatives.ts`). The builder
— where the choice is durable — has none of it. Reuse that endpoint rather than
inventing a second ranking.

The 67-entry catalog (`db/exercise-catalog.ts`) is not exposed by any route today;
the builder needs it, so a `GET /api/exercises/catalog` or an `includeCatalog`
flag on the list route is the one API addition the fix requires.

Watch the sizing rule in CLAUDE.md: program-builder controls are budgeted against
390px and a combobox row is new width. Re-do that arithmetic rather than assuming.
