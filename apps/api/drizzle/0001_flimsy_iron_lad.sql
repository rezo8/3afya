ALTER TABLE "program_day" ADD COLUMN "warmup" text;--> statement-breakpoint
ALTER TABLE "program_day" ADD COLUMN "cooldown" text;--> statement-breakpoint
ALTER TABLE "program_exercise" ADD COLUMN "target_reps_max" integer;--> statement-breakpoint
ALTER TABLE "program_exercise" ADD COLUMN "rest_sec" integer;--> statement-breakpoint
ALTER TABLE "program_exercise" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "program_exercise" ADD COLUMN "superset_group" text;--> statement-breakpoint
ALTER TABLE "program_exercise" ADD COLUMN "section" text;