-- Custom SQL migration file, put your code below! --

-- drizzle-kit cannot emit a named DROP CONSTRAINT for an implicit column-level
-- primary key (it generates a commented placeholder instead), so this drop
-- lives in a --custom migration ordered before the generated one. The name is
-- deterministic: migration 0000 created nutrition_target with
-- "user_id" text PRIMARY KEY, which Postgres names nutrition_target_pkey.
ALTER TABLE "nutrition_target" DROP CONSTRAINT "nutrition_target_pkey";
