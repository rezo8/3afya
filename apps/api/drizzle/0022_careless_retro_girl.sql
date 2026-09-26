CREATE TABLE "fuel_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"protein_g" real DEFAULT 0 NOT NULL,
	"calories" integer DEFAULT 0 NOT NULL,
	"carbs_g" real,
	"fat_g" real,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fuel_entry" ADD COLUMN "item_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_item_user_label_idx" ON "fuel_item" USING btree ("user_id","label");--> statement-breakpoint
ALTER TABLE "fuel_entry" ADD CONSTRAINT "fuel_entry_item_id_fuel_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."fuel_item"("id") ON DELETE set null ON UPDATE no action;