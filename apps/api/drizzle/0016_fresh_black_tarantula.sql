CREATE TABLE "session_substitution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"program_exercise_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_substitution" ADD CONSTRAINT "session_substitution_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_substitution" ADD CONSTRAINT "session_substitution_program_exercise_id_program_exercise_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_substitution" ADD CONSTRAINT "session_substitution_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_substitution_slot_idx" ON "session_substitution" USING btree ("session_id","program_exercise_id");