import type { NutritionTarget, TargetPeriod } from "@afya/shared";
import { localDate, shiftLocalDate } from "./day";

/** A target as stored: append-only, so each row says when it started applying. */
export type TargetRow = NutritionTarget & { createdAt: Date };

/**
 * The target a day was judged against: the newest one set before that day ended. A target
 * changed at 9pm applies to that whole day, since the user changed it with the day's food in
 * view. Days before any target was set fall back to `fallback`.
 */
export function targetInForce(rows: TargetRow[], dayEnd: Date, fallback: NutritionTarget): NutritionTarget {
  let inForce: TargetRow | null = null;
  for (const row of rows) {
    if (row.createdAt < dayEnd && (!inForce || row.createdAt > inForce.createdAt)) inForce = row;
  }
  if (!inForce) return fallback;
  return { proteinG: inForce.proteinG, calories: inForce.calories, carbsG: inForce.carbsG, fatG: inForce.fatG };
}

const sameTarget = (a: NutritionTarget, b: NutritionTarget) =>
  a.proteinG === b.proteinG && a.calories === b.calories && a.carbsG === b.carbsG && a.fatG === b.fatG;

/**
 * The append-only target log read as periods, newest first: "Sep 3 → now". Several edits
 * on one day collapse into the last of them, since a day is judged against the target it
 * ended with (`targetInForce`). A save that changed nothing merges into the period before it.
 */
export function targetPeriods(rows: TargetRow[], zone: string): TargetPeriod[] {
  const byDay: { from: string; target: NutritionTarget }[] = [];
  for (const row of [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const from = localDate(row.createdAt, zone);
    const target = { proteinG: row.proteinG, calories: row.calories, carbsG: row.carbsG, fatG: row.fatG };
    const last = byDay.at(-1);
    if (last && last.from === from) last.target = target;
    else byDay.push({ from, target });
  }
  const merged: { from: string; target: NutritionTarget }[] = [];
  for (const period of byDay) {
    const previous = merged.at(-1);
    if (previous && sameTarget(previous.target, period.target)) continue;
    merged.push(period);
  }
  const periods: TargetPeriod[] = [];
  merged.forEach((period, i) => {
    const next = merged[i + 1];
    periods.push({ from: period.from, to: next ? shiftLocalDate(next.from, -1) : null, target: period.target });
  });
  return periods.reverse();
}
