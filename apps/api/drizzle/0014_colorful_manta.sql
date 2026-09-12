ALTER TABLE "body_metric" ALTER COLUMN "measured_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exercise" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exercise" ALTER COLUMN "archived_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fuel_entry" ALTER COLUMN "logged_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "nutrition_target" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "program" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "program" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "set_log" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workout_session" ALTER COLUMN "performed_at" SET DATA TYPE timestamp with time zone;