# Session handover — ISS-005, the day boundary

Targeted autonomous session, one item: ISS-005. Committed as `5dd9b86` on branch `fix/local-day-boundary`, not pushed, no PR.

## What was wrong

The fuel tracker did not reset at midnight. `startOfDay` and `localDate` in the fuel route answered "what day is it" with `setHours(0,0,0,0)` and `getDate()`, which resolve against the server process's zone. Nothing sets TZ in the Dockerfile, cloudbuild.yaml or docker-compose, so Cloud Run runs UTC. For a user in UTC-4 the day rolled at 20:00: an evening meal counted toward tomorrow, and at real midnight nothing reset because the rollover had already happened four hours earlier.

The sessions route carried an identical `startOfDay`, so `isToday` had the same flaw, and both find-or-create rules key on it.

## What was built

`apps/api/src/day.ts` is now the only place a calendar day is decided — `parseTimeZone`, `localDate`, `startOfDay`, `startOfDaysAgo`, `isSameDay`, `isToday`. Both duplicated helpers are deleted.

The client sends its IANA zone as `?tz=`, appended centrally in the web api client and read per call so a laptop crossing a timezone reports the new one without a reload. `resolveTimeZone` middleware resolves it once for `/api/*`; handlers read `c.get("timeZone")` and never parse it. An unrecognized zone falls back to UTC, the previous behaviour.

A query parameter rather than a header, deliberately: a custom header would make every GET a preflighted cross-origin request, and the api client keeps GETs simple on purpose to avoid an extra round-trip against a scale-to-zero backend. That decision is documented in the middleware.

## The finding worth carrying forward

**`Intl.DateTimeFormat` accepts offset strings like `-05:00` as a timeZone.** A test written to assert rejection failed, which is how this surfaced. Had validation trusted `Intl`, `?tz=-05:00` would have passed and silently bucketed historical days an hour out across every DST boundary — the precise failure the IANA-per-request decision was made to prevent. `parseTimeZone` now rejects offset forms itself: an IANA name always starts with a letter, an offset never does.

## Timestamps

All nine tracker datetime columns are now `timestamptz`. Migration `0013_timestamps_to_timestamptz.sql` is hand-written `--custom`, not generated: drizzle-kit emits `SET DATA TYPE` with no `USING` clause, which reinterprets each naive value in the database session's own TimeZone setting — the same implicit dependency the whole fix removes. `USING col AT TIME ZONE 'UTC'` makes the conversion mean the same thing on any server. `0014` is the generated no-op that syncs drizzle's snapshot so the next `db:generate` does not re-emit it. Better Auth's tables in `auth.ts` are untouched: this app reads them and never migrates them. Instants verified preserved across the conversion.

**Prod note:** `0013` rewrites nine tables on the next deploy. Tiny at this data size, but it is a table rewrite, not a metadata-only change.

## Verification

Reproduced the reported symptom against the running API. A 21:30 New York dinner (01:30 UTC next day): under UTC it sits on today's counter at 40 g — the bug as reported — and under `America/New_York` today reads 0 g with history bucketing it to Sep 11. `/api/fuel/history` buckets correctly in both zones. `/api/sessions/freeform` keys find-or-create on the local day, so under `Pacific/Kiritimati` (UTC+14, already the next day) it declines to resume yesterday's session. `?tz=-05:00` falls back to UTC rather than throwing.

11 new tests cover both US DST transition days — the 23-hour and 25-hour days, where a single-pass offset calculation lands an hour out — plus the date line, offset rejection and idempotence. Full suite 33 passing; typecheck, lint, build clean.

## Rules added

The umbrella `CLAUDE.md` (one directory up, governing every app in the family, both the Node and Go blueprints) gained a **"Datetimes carry their zone — always"** section: every datetime column is `timestamptz` or a UTC epoch, a calendar day belongs to the user and not the server, and an IANA name is never an offset. 3afya's `RULES.md` gained rule 6 pointing at `day.ts`.

The umbrella file is **not in any git repo** — the umbrella folder is a container for independent app repos — so that edit exists only on disk.

## State

- Branch `fix/local-day-boundary`, one commit ahead of `main`, unpushed.
- `main` is 2 ahead of `origin/main` (the two ledger commits from the previous session landed there directly — `feat/freeform-sessions` had been merged and pushed between sessions).
- Untracked and deliberately not committed: `ARCHITECTURE.md`, `PROJECT_RECOMMENDATIONS.md`, `UX_ACTIVE_WORKOUT_AUDIT.json`.

## Suggested next

T-001 (surface failure and retry on every mutation) is the highest-value unblocked ticket — ProgramScreen still has 13 mutations with no `onError`. `seed.ts` still uses `setHours` for demo-data generation; not user-facing day logic, left alone deliberately.