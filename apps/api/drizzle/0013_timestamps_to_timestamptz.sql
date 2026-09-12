-- Make the tracker's instants unambiguous.
--
-- Every one of these columns held a UTC instant written by the API, in a `timestamp without
-- time zone` column that cannot record which zone it meant. Day-boundary bucketing now runs
-- against the user's IANA zone, so the stored values have to say what they are.
--
-- The USING clause is the point. Without it Postgres reinterprets each naive value in the
-- database session's own TimeZone setting, which silently shifts every historical instant if
-- that setting is ever anything but UTC. Stating 'UTC' explicitly makes the conversion mean
-- the same thing on any server, which is the ambiguity this migration exists to remove.
--
-- Instants are preserved exactly; only their type becomes honest about the offset.

ALTER TABLE "body_metric" ALTER COLUMN "measured_at" TYPE timestamp with time zone USING "measured_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "exercise" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "exercise" ALTER COLUMN "archived_at" TYPE timestamp with time zone USING "archived_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "fuel_entry" ALTER COLUMN "logged_at" TYPE timestamp with time zone USING "logged_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "nutrition_target" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "program" ALTER COLUMN "created_at" TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "program" ALTER COLUMN "updated_at" TYPE timestamp with time zone USING "updated_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "set_log" ALTER COLUMN "completed_at" TYPE timestamp with time zone USING "completed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "workout_session" ALTER COLUMN "performed_at" TYPE timestamp with time zone USING "performed_at" AT TIME ZONE 'UTC';
