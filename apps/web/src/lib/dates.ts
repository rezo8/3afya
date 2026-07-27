const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const MS_PER_DAY = 86_400_000;

/**
 * Whole local calendar days between `at` and today — 0 for anything logged today,
 * regardless of clock time. Rounded because a DST boundary makes a "day" 23 or 25
 * hours long and truncation would report yesterday as today.
 */
export function daysAgo(at: Date): number {
  return Math.round((startOfLocalDay(new Date()).getTime() - startOfLocalDay(at).getTime()) / MS_PER_DAY);
}
