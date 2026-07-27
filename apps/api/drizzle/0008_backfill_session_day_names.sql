-- Custom SQL migration file, put your code below! --

-- One-time backfill of the day-name snapshot for sessions that still point at a
-- live program day. Sessions already orphaned (day_id IS NULL) lost their name
-- before the snapshot existed and stay null — there is nothing to recover it from.
UPDATE "workout_session" ws
SET "day_name" = pd."name"
FROM "program_day" pd
WHERE ws."day_id" = pd."id" AND ws."day_name" IS NULL;
