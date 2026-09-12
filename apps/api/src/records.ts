import type { DistanceUnit, ExerciseKind, PrEntry, PrKind } from "@afya/shared";
import { toMetres } from "./distance";

export type RecordSet = {
  id: string;
  weight: number;
  reps: number;
  durationSec: number;
  distance: number;
  distanceUnit: DistanceUnit | null;
  isWarmup: boolean;
  completedAt: Date;
};

export const epley = (weight: number, reps: number) => (weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0);

const SCORE: Record<PrKind, (s: RecordSet) => number> = {
  est1rm: (s) => epley(s.weight, s.reps),
  weight: (s) => (s.weight > 0 ? s.weight : 0),
  volume: (s) => (s.weight > 0 && s.reps > 0 ? s.weight * s.reps : 0),
  reps: (s) => (s.reps > 0 ? s.reps : 0),
  duration: (s) => (s.durationSec > 0 ? s.durationSec : 0),
  // Metres, not the entered number: a 10 km run must beat a 5 mile one.
  distance: (s) => toMetres(s.distance, s.distanceUnit),
};

export function prKindsFor(kind: ExerciseKind): PrKind[] {
  switch (kind) {
    case "weighted":
      return ["est1rm", "weight", "volume"];
    case "reps":
      return ["reps"];
    case "time":
      return ["duration"];
    case "distance":
      // Duration is optional on a distance set, so a ride that was never timed
      // simply scores zero for it and holds no duration record.
      return ["distance", "duration"];
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeRecords(kind: ExerciseKind, sets: RecordSet[]): PrEntry[] {
  const working = sets.filter((s) => !s.isWarmup);
  const out: PrEntry[] = [];
  for (const k of prKindsFor(kind)) {
    let best: RecordSet | null = null;
    let bestScore = 0;
    for (const s of working) {
      const v = SCORE[k](s);
      if (v > 0 && v > bestScore) {
        bestScore = v;
        best = s;
      }
    }
    if (best) {
      out.push({
        kind: k,
        value: round1(bestScore),
        setId: best.id,
        weight: best.weight,
        reps: best.reps,
        durationSec: best.durationSec,
        distance: best.distance,
        distanceUnit: best.distanceUnit,
        achievedAt: best.completedAt.toISOString(),
      });
    }
  }
  return out;
}

export function detectPrs(kind: ExerciseKind, priorSets: RecordSet[], newSet: RecordSet): PrKind[] {
  if (newSet.isWarmup) return [];
  const priorWorking = priorSets.filter((s) => !s.isWarmup);
  const broken: PrKind[] = [];
  for (const k of prKindsFor(kind)) {
    const nv = SCORE[k](newSet);
    if (nv <= 0) continue;
    let priorBest = 0;
    let hasPrior = false;
    for (const s of priorWorking) {
      const v = SCORE[k](s);
      if (v > 0) {
        hasPrior = true;
        if (v > priorBest) priorBest = v;
      }
    }
    if (hasPrior && nv > priorBest) broken.push(k);
  }
  return broken;
}
