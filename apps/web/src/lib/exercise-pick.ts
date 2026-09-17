import type { CatalogExercise, Equipment, Exercise, ExerciseKind, MuscleGroup } from "@afya/shared";

/**
 * What the exercise picker hands back. Creating is its own answer rather than what
 * happens when nothing matched — a typo must not be able to mint a second, untagged
 * library row, which is what an exact-match-else-create field does every time.
 */
export type ExercisePick =
  | { source: "library"; exerciseId: string }
  | { source: "catalog"; name: string }
  | { source: "new"; name: string; kind: ExerciseKind };

export interface PickerOption {
  key: string;
  name: string;
  primaryMuscleGroup: MuscleGroup | null;
  equipment: Equipment | null;
  /** Null for an exercise the day already has — listed so it reads as present, not missing. */
  pick: ExercisePick | null;
  badge: "new" | "in this day" | null;
}

/** The query split into the tokens every match has to contain. */
export const queryTokens = (query: string): string[] => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Every token must appear somewhere in the name, in any order, so "press inc" finds
 * "Incline Dumbbell Press" — substring and token, never exact. It is deliberately not
 * fuzzy: an abbreviation the name does not contain ("db") does not match, for the same
 * reason the catalog never guesses at a name it doesn't know.
 */
export const matchesQuery = (name: string, tokens: string[]): boolean => {
  const lower = name.toLowerCase();
  return tokens.every((token) => lower.includes(token));
};

/**
 * The pickable universe, ranked: the user's own library first (names they train and
 * have history for), then what the day already holds, then curated catalog names they
 * don't own yet.
 */
export function buildPickerOptions(
  library: Exercise[],
  catalog: CatalogExercise[],
  alreadyInDay: ReadonlySet<string>,
): PickerOption[] {
  const libraryNames = new Set(library.map((e) => e.name.toLowerCase()));
  const available: PickerOption[] = [];
  const present: PickerOption[] = [];
  for (const e of library) {
    const inDay = alreadyInDay.has(e.id);
    const option: PickerOption = {
      key: e.id,
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      equipment: e.equipment,
      pick: inDay ? null : { source: "library", exerciseId: e.id },
      badge: inDay ? "in this day" : null,
    };
    (inDay ? present : available).push(option);
  }

  const fromCatalog: PickerOption[] = catalog
    .filter((entry) => !libraryNames.has(entry.name.toLowerCase()))
    .map((entry) => ({
      key: `catalog:${entry.name}`,
      name: entry.name,
      primaryMuscleGroup: entry.primaryMuscleGroup,
      equipment: entry.equipment,
      pick: { source: "catalog", name: entry.name },
      badge: "new",
    }));

  return [...available, ...present, ...fromCatalog];
}

/** True when the typed name is one nothing in the picker already answers to. */
export const isNewName = (typed: string, options: PickerOption[]): boolean => {
  const lower = typed.trim().toLowerCase();
  return lower !== "" && !options.some((option) => option.name.toLowerCase() === lower);
};
