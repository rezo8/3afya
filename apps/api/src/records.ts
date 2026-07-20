import type { ExerciseKind, PrEntry, PrKind } from "@afya/shared";

export type RecordSet = {
  id: string;
  weight: number;
  reps: number;
  durationSec: number;
  completedAt: Date;
};

export const epley = (weight: number, reps: number) => (weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0);

const SCORE: Record<PrKind, (s: RecordSet) => number> = {
  est1rm: (s) => epley(s.weight, s.reps),
  weight: (s) => (s.weight > 0 ? s.weight : 0),
  volume: (s) => (s.weight > 0 && s.reps > 0 ? s.weight * s.reps : 0),
  reps: (s) => (s.reps > 0 ? s.reps : 0),
  duration: (s) => (s.durationSec > 0 ? s.durationSec : 0),
};

export function prKindsFor(kind: ExerciseKind): PrKind[] {
  if (kind === "weighted") return ["est1rm", "weight", "volume"];
  if (kind === "reps") return ["reps"];
  return ["duration"];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeRecords(kind: ExerciseKind, sets: RecordSet[]): PrEntry[] {
  const out: PrEntry[] = [];
  for (const k of prKindsFor(kind)) {
    let best: RecordSet | null = null;
    let bestScore = 0;
    for (const s of sets) {
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
        achievedAt: best.completedAt.toISOString(),
      });
    }
  }
  return out;
}

export function detectPrs(kind: ExerciseKind, priorSets: RecordSet[], newSet: RecordSet): PrKind[] {
  const broken: PrKind[] = [];
  for (const k of prKindsFor(kind)) {
    const nv = SCORE[k](newSet);
    if (nv <= 0) continue;
    let priorBest = 0;
    let hasPrior = false;
    for (const s of priorSets) {
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
