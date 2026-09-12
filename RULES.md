# RULES.md — 3afya

Durable engineering rules for anyone, human or agent, working on this app. Not a
backlog and not tied to a sprint: these are the constraints that hold across
every ticket in `.story/`.

For stack, conventions, and current architecture see [`CLAUDE.md`](./CLAUDE.md)
and [`ARCHITECTURE.md`](./ARCHITECTURE.md). This file is the *why you can't do
that* list.

---

## Data and history

1. **Every historical row snapshots the facts that mattered at write time.**
   Nothing feeding a PR, a trend, or a historical display may be computed by
   joining live against current program or catalog state. A day renamed today
   must not change what last month's session was called.

2. **Before adding a workout concept, decide whether it belongs to planned
   training, performed training, or a derived view** — and never blur the
   plan/performed boundary with a join table. An exercise belongs to a session
   because it has a logged set, not because a row says so.

3. **Catalog data must never cascade-delete performance history.** A delete
   against a row with historical references archives; it does not destroy.
   `set_log.exerciseId` is `onDelete: "restrict"` for this reason, and Postgres
   refusing the delete is the backstop, not the plan.

4. **A typed discriminant that decides how other columns are read is a taxonomy
   commitment.** `exercise.kind` decides whether a set's weight, reps, duration,
   or distance is the real number. Never let an edit to it silently reinterpret
   historical rows without a snapshot column in place first.

5. **Finish a field's read and write path together, in the same change.** A
   column that is readable but never writable — or the reverse — is worse than
   not having the field, because it looks finished when it isn't.

6. **Datetimes carry their zone, and a calendar day belongs to the user.** Every
   datetime column is `timestamptz` (Drizzle `{ withTimezone: true }`) or a UTC
   epoch — never a naive `timestamp`. Anything that means "today", "this week",
   a streak, or a daily reset resolves its boundary through `apps/api/src/day.ts`
   against the IANA zone the client sends as `?tz=`, never through `setHours` or
   `getDate`, which answer in the server's zone. An IANA name, never an offset:
   an offset carries no DST rule, and `Intl` will happily accept `-05:00`, so the
   validator rejects offset forms itself. Learned the hard way in ISS-005, when
   fuel stopped resetting at midnight for anyone not living in UTC.

## The workout loop

7. **The active workout loop is the highest-frequency, highest-stakes surface in
   the app.** Judge every change to it by tap count, ability to recover from a
   mistake, and behaviour on a flaky connection — not by the happy path. It is
   used one-handed, mid-set, on gym wifi.

8. **Every state-changing mutation has a visible pending, success, and failure
   outcome.** Silent failure on a write path the user just acted on is never
   acceptable. A retry belongs next to the failure, not in a reload.

## Building

9. **No generic repository layer, validation framework, or structural
   abstraction until at least two concrete call sites need it.** Deduplicate the
   moment a second copy exists — not before, and not "just in case". Duplicated
   *knowledge* is a defect; duplicated *shape* often isn't.

10. **Don't build personalization on data that isn't trustworthy yet.** Fix the
    underlying signal before building something smarter on top of it. Warm-up
    flagging had to land before PR math meant anything.

11. **Test the math, not the plumbing.** Records, rotation, unit conversion, and
    progression rules are pure functions with real consequences; they get tests
    beside the code they test. A bug fixed there gets the test that would have
    caught it.

## Scope

12. **A feature ships only if it improves logging, progression, understanding,
    or personalization.** "A competitor has it" is not a reason on its own.

13. **This is a personal, single-user, self-hosted app** unless a future decision
    explicitly changes that framing. Don't add multi-tenant, social,
    unit-preference, or localization scaffolding speculatively.

---

Source: `PROJECT_RECOMMENDATIONS.md` §15, plus rule 11 from the existing test
layout and rule 6 from ISS-005. Change these deliberately — a rule quietly dropped is how the thing
it prevented comes back.
