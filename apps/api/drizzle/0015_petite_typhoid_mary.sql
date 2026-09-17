ALTER TABLE "set_log" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "set_log_session_idem_idx" ON "set_log" USING btree ("session_id","idempotency_key");