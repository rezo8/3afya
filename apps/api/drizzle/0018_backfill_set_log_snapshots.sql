-- Fill the from_program / exercise_kind snapshots on rows that predate them.
--
-- Best effort by construction: the only source for "was this planned" is the program as
-- it stands now, which is exactly what the live join read. A row whose exercise was
-- already removed from its day has lost that fact and backfills as unplanned. From here
-- on the value is written at insert and never recomputed.
--
-- A slot counts as performed by its substitute when the session swapped it, matching
-- buildDayExercises: the substitute is planned, and the exercise it replaced is not.
UPDATE "set_log" AS s
SET "from_program" = EXISTS (
  SELECT 1
  FROM "workout_session" AS w
  JOIN "program_exercise" AS pe ON pe."day_id" = w."day_id"
  LEFT JOIN "session_substitution" AS ss
    ON ss."session_id" = w."id" AND ss."program_exercise_id" = pe."id"
  WHERE w."id" = s."session_id"
    AND COALESCE(ss."exercise_id", pe."exercise_id") = s."exercise_id"
)
WHERE s."from_program" IS NULL;
--> statement-breakpoint
UPDATE "set_log" AS s
SET "exercise_kind" = e."kind"
FROM "exercise" AS e
WHERE e."id" = s."exercise_id" AND s."exercise_kind" IS NULL;
