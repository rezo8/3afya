import { describe, expect, it } from "vitest";
import type { FuelHistoryDay } from "@afya/shared";
import { summarizeWeek } from "./fuel-week";

const day = (date: string, calories: number, proteinG: number, entryCount = 3, targetCalories = 2850): FuelHistoryDay => ({
  date,
  calories,
  proteinG,
  entryCount,
  target: { proteinG: 185, calories: targetCalories, carbsG: null, fatG: null },
});

const TODAY = "2026-09-26";
const week = [
  day("2026-09-20", 2610, 181),
  day("2026-09-21", 2940, 190),
  day("2026-09-22", 2380, 165),
  day("2026-09-23", 2210, 160),
  day("2026-09-24", 0, 0, 0),
  day("2026-09-25", 2260, 164),
  day(TODAY, 1770, 168),
];

describe("summarizeWeek", () => {
  it("counts every logged day, today included", () => {
    expect(summarizeWeek(week, TODAY)).toMatchObject({ daysLogged: 6, daysInWindow: 7 });
  });

  it("averages complete logged days only, leaving out today and the unlogged day", () => {
    const summary = summarizeWeek(week, TODAY);
    expect(summary.daysAveraged).toBe(5);
    expect(summary.average).toEqual({ calories: 2480, proteinG: 172 });
  });

  it("never averages an unlogged day in as a fast", () => {
    const withGap = summarizeWeek([day("2026-09-24", 0, 0, 0), day("2026-09-25", 2000, 150)], TODAY);
    expect(withGap.average?.calories).toBe(2000);
  });

  it("compares against the targets that were in force on those days", () => {
    const changed = [day("2026-09-24", 2600, 180, 2, 2600), day("2026-09-25", 2800, 180, 2, 2850)];
    expect(summarizeWeek(changed, TODAY).targetAverage?.calories).toBe(2725);
  });

  it("has no average when no complete day was logged", () => {
    expect(summarizeWeek([day(TODAY, 900, 60)], TODAY).average).toBeNull();
  });
});
