import type { FuelHistoryDay } from "@afya/shared";
import type { LocalDate } from "./fuel-date";

export interface WeekSummary {
  /** Days in the window with at least one entry, today included. */
  daysLogged: number;
  daysInWindow: number;
  /** Complete, logged days the averages are over: today and unlogged days are left out. */
  daysAveraged: number;
  /** Null when no complete day was logged, so there is nothing to average. */
  average: { calories: number; proteinG: number } | null;
  /** The average of the targets in force on the averaged days, to compare the average against. */
  targetAverage: { calories: number; proteinG: number } | null;
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * A week of fuel scored as a week. Physiology doesn't settle up daily: one high day in a
 * compliant week is noise. Two kinds of day are left out of the average, each for its own
 * reason. A day with nothing logged averages in as a fast and flatters every number, so it
 * is counted and shown instead. Today is still being eaten, and half a day drags the mean
 * down for no reason.
 */
export function summarizeWeek(days: FuelHistoryDay[], today: LocalDate): WeekSummary {
  const logged = days.filter((d) => d.entryCount > 0);
  const complete = logged.filter((d) => d.date !== today);
  return {
    daysLogged: logged.length,
    daysInWindow: days.length,
    daysAveraged: complete.length,
    average:
      complete.length === 0
        ? null
        : { calories: mean(complete.map((d) => d.calories)), proteinG: mean(complete.map((d) => d.proteinG)) },
    targetAverage:
      complete.length === 0
        ? null
        : {
            calories: mean(complete.map((d) => d.target.calories)),
            proteinG: mean(complete.map((d) => d.target.proteinG)),
          },
  };
}
