import type { Equipment, ExerciseAlternative } from "@afya/shared";

/** Short enough to scan between sets — a scrolling list is a list nobody reads. */
export const ALTERNATIVES_LIMIT = 12;

export interface RankAlternativesInput {
  /** Equipment of the exercise being replaced. */
  replacing: Equipment | null;
  /** Same-muscle exercises the user already has. */
  fromLibrary: ExerciseAlternative[];
  /** Same-muscle catalog entries the user doesn't have yet. */
  fromCatalog: ExerciseAlternative[];
  limit?: number;
}

/**
 * Order substitutes for one exercise.
 *
 * The user's own library comes first — those are names they already train and have
 * history for. Within each half, alternatives using *different* equipment rank
 * ahead of ones using the same: the usual reason to look for a substitute is that
 * the bench or machine is occupied, so another exercise on that same machine is no
 * help. Ties break alphabetically so the list is stable between calls.
 */
export const rankAlternatives = ({
  replacing,
  fromLibrary,
  fromCatalog,
  limit = ALTERNATIVES_LIMIT,
}: RankAlternativesInput): ExerciseAlternative[] => {
  const usesSameEquipment = (alternative: ExerciseAlternative): number => (alternative.equipment === replacing ? 1 : 0);
  const bySwapValue = (a: ExerciseAlternative, b: ExerciseAlternative): number =>
    usesSameEquipment(a) - usesSameEquipment(b) || a.name.localeCompare(b.name);

  return [...[...fromLibrary].sort(bySwapValue), ...[...fromCatalog].sort(bySwapValue)].slice(0, limit);
};
