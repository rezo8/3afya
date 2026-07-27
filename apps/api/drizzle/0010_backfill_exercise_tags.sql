-- Tag exercises that predate the primary_muscle_group / equipment columns.
--
-- The VALUES list is a materialized snapshot of the curated catalog in
-- src/db/exercise-catalog.ts as of the commit that added it (65 entries, printed from
-- that constant rather than typed out, so the two cannot drift by hand). Matching is
-- exact and case-insensitive on the name, exactly like findCatalogExercise() --
-- deliberately no fuzzy matching, so a name the catalog does not list verbatim stays
-- untagged instead of being guessed at.
--
-- Only rows still missing a muscle group are touched: this fills gaps, it never re-tags
-- something already set. Adding catalog entries later does NOT retroactively tag rows a
-- user already created under those names -- that needs its own new backfill migration.
UPDATE "exercise" AS e
SET "primary_muscle_group" = c.muscle_group,
    "equipment" = c.equipment
FROM (
  VALUES
    ('barbell row'::text, 'back'::text, 'barbell'::text),
    ('chest-supported row', 'back', 'machine'),
    ('chin-up', 'back', 'bodyweight'),
    ('deadlift', 'back', 'barbell'),
    ('lat pulldown', 'back', 'cable'),
    ('pull-up', 'back', 'bodyweight'),
    ('seated cable row', 'back', 'cable'),
    ('single-arm dumbbell row', 'back', 'dumbbell'),
    ('t-bar row', 'back', 'barbell'),
    ('barbell curl', 'biceps', 'barbell'),
    ('cable curl', 'biceps', 'cable'),
    ('hammer curl', 'biceps', 'dumbbell'),
    ('incline dumbbell curl', 'biceps', 'dumbbell'),
    ('preacher curl', 'biceps', 'machine'),
    ('seated calf raise', 'calves', 'machine'),
    ('single-leg calf raise', 'calves', 'bodyweight'),
    ('standing calf raise', 'calves', 'machine'),
    ('barbell bench press', 'chest', 'barbell'),
    ('cable fly', 'chest', 'cable'),
    ('dumbbell bench press', 'chest', 'dumbbell'),
    ('incline dumbbell press', 'chest', 'dumbbell'),
    ('machine chest press', 'chest', 'machine'),
    ('pec deck', 'chest', 'machine'),
    ('push-up', 'chest', 'bodyweight'),
    ('weighted dip', 'chest', 'bodyweight'),
    ('ab wheel rollout', 'core', 'other'),
    ('cable crunch', 'core', 'cable'),
    ('dead bug', 'core', 'bodyweight'),
    ('hanging knee raise', 'core', 'bodyweight'),
    ('plank', 'core', 'bodyweight'),
    ('side plank', 'core', 'bodyweight'),
    ('dead hang', 'forearms', 'bodyweight'),
    ('wrist curl', 'forearms', 'dumbbell'),
    ('burpee', 'full_body', 'bodyweight'),
    ('farmer carry', 'full_body', 'dumbbell'),
    ('kettlebell swing', 'full_body', 'kettlebell'),
    ('cable kickback', 'glutes', 'cable'),
    ('glute bridge', 'glutes', 'bodyweight'),
    ('hip thrust', 'glutes', 'barbell'),
    ('good morning', 'hamstrings', 'barbell'),
    ('lying leg curl', 'hamstrings', 'machine'),
    ('nordic curl', 'hamstrings', 'bodyweight'),
    ('romanian deadlift', 'hamstrings', 'barbell'),
    ('seated hamstring curl', 'hamstrings', 'machine'),
    ('back squat', 'quads', 'barbell'),
    ('bulgarian split squat', 'quads', 'dumbbell'),
    ('front squat', 'quads', 'barbell'),
    ('goblet squat', 'quads', 'kettlebell'),
    ('hack squat', 'quads', 'machine'),
    ('leg extension', 'quads', 'machine'),
    ('leg press', 'quads', 'machine'),
    ('walking lunge', 'quads', 'dumbbell'),
    ('arnold press', 'shoulders', 'dumbbell'),
    ('band pull-apart', 'shoulders', 'band'),
    ('cable lateral raise', 'shoulders', 'cable'),
    ('face pulls', 'shoulders', 'cable'),
    ('lateral raise', 'shoulders', 'dumbbell'),
    ('machine shoulder press', 'shoulders', 'machine'),
    ('overhead press', 'shoulders', 'barbell'),
    ('rear delt fly', 'shoulders', 'dumbbell'),
    ('bench dip', 'triceps', 'bodyweight'),
    ('machine triceps extension', 'triceps', 'machine'),
    ('overhead triceps extension', 'triceps', 'dumbbell'),
    ('skullcrusher', 'triceps', 'barbell'),
    ('triceps pushdown', 'triceps', 'cable')
) AS c(name, muscle_group, equipment)
WHERE lower(e."name") = c.name
  AND e."primary_muscle_group" IS NULL;
