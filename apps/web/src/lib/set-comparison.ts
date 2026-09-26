import type { DistanceUnit, ExerciseKind, SetLog } from "@afya/shared";

/** The numbers on the entry card for the set about to be logged. */
export interface SetEntry {
  weight: number;
  reps: number;
  durationSec: number;
  distance: number;
  distanceUnit: DistanceUnit;
}

/**
 * How the set about to be logged reads against the previous session. Each reason for
 * saying nothing is its own state, so the screen never claims "first time" for a set
 * that simply has no counterpart.
 */
export type SetComparison =
  | { kind: "first-time" }
  | { kind: "warmup" }
  | { kind: "no-matching-set"; position: number }
  | { kind: "different-unit"; previousUnit: DistanceUnit | null }
  | { kind: "delta"; position: number; delta: number; unit: string };

/**
 * The previous session's working set at the position the next working set will fill.
 * Position counts working sets only, because a warm-up still takes a set number.
 */
export function matchingPreviousSet(previousWorkingSets: SetLog[], loggedSets: SetLog[]): SetLog | null {
  const workingSetsLogged = loggedSets.filter((s) => !s.isWarmup).length;
  return previousWorkingSets[workingSetsLogged] ?? null;
}

export function compareToPreviousSession(input: {
  exerciseKind: ExerciseKind;
  entry: SetEntry;
  isWarmup: boolean;
  previousWorkingSets: SetLog[];
  loggedSets: SetLog[];
}): SetComparison {
  const { exerciseKind, entry, previousWorkingSets, loggedSets } = input;
  if (input.isWarmup) return { kind: "warmup" };
  if (previousWorkingSets.length === 0) return { kind: "first-time" };

  const position = loggedSets.filter((s) => !s.isWarmup).length + 1;
  const previous = matchingPreviousSet(previousWorkingSets, loggedSets);
  if (!previous) return { kind: "no-matching-set", position };

  switch (exerciseKind) {
    case "weighted":
      return { kind: "delta", position, delta: +(entry.weight - previous.weight).toFixed(1), unit: "lb" };
    case "reps":
      return { kind: "delta", position, delta: entry.reps - previous.reps, unit: "reps" };
    case "time":
      return { kind: "delta", position, delta: entry.durationSec - previous.durationSec, unit: "s" };
    case "distance":
      // Only comparable in the same unit — a cross-unit comparison is left unsaid
      // rather than converted behind the user's back.
      if (previous.distanceUnit !== entry.distanceUnit) {
        return { kind: "different-unit", previousUnit: previous.distanceUnit };
      }
      return { kind: "delta", position, delta: +(entry.distance - previous.distance).toFixed(2), unit: entry.distanceUnit };
  }
}
