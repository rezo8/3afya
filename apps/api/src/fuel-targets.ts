import type { NutritionTarget } from "@afya/shared";

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
