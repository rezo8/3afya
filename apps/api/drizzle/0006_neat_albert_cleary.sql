/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'nutrition_target'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "nutrition_target" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "nutrition_target" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "nutrition_target" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "nutrition_target_user_created_idx" ON "nutrition_target" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "nutrition_target" DROP COLUMN "updated_at";