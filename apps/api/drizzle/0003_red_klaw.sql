ALTER TABLE "set_log" DROP CONSTRAINT "set_log_exercise_id_exercise_id_fk";
--> statement-breakpoint
ALTER TABLE "exercise" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "set_log" ADD CONSTRAINT "set_log_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;