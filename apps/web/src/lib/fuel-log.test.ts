import { describe, expect, it } from "vitest";
import type { FuelEntry } from "@afya/shared";
import { groupByPartOfDay, partOfDay } from "./fuel-log";

/** An entry eaten at a local wall-clock time on Sep 26. */
const at = (hour: number, minute: number, label = "Food", proteinG = 10, calories = 100): FuelEntry => ({
  id: `${label}-${hour}:${minute}`,
  label,
  proteinG,
  calories,
  carbsG: null,
  fatG: null,
  portion: null,
  itemId: null,
  loggedAt: new Date(2026, 8, 26, hour, minute).toISOString(),
});

describe("partOfDay", () => {
  it("puts each boundary hour in the part it begins", () => {
    expect(partOfDay(new Date(2026, 8, 26, 10, 59))).toBe("morning");
    expect(partOfDay(new Date(2026, 8, 26, 11, 0))).toBe("midday");
    expect(partOfDay(new Date(2026, 8, 26, 15, 0))).toBe("afternoon");
    expect(partOfDay(new Date(2026, 8, 26, 18, 0))).toBe("evening");
  });

  it("counts just after midnight as morning", () => {
    expect(partOfDay(new Date(2026, 8, 26, 0, 30))).toBe("morning");
  });
});

describe("groupByPartOfDay", () => {
  const day = [at(12, 40, "Chicken & rice", 62, 700), at(7, 10, "Eggs & oats", 42, 560), at(9, 30, "Shake", 24, 150)];

  it("orders parts through the day and entries by when they were eaten", () => {
    const groups = groupByPartOfDay(day, null);
    expect(groups.map((g) => g.part)).toEqual(["morning", "midday"]);
    expect(groups[0]?.entries.map((e) => e.label)).toEqual(["Eggs & oats", "Shake"]);
  });

  it("totals each part", () => {
    const [morning] = groupByPartOfDay(day, null);
    expect([morning?.proteinG, morning?.calories]).toEqual([66, 710]);
  });

  it("leaves out empty parts on a past day", () => {
    expect(groupByPartOfDay(day, null).some((g) => g.part === "evening")).toBe(false);
  });

  it("keeps the current part on today even while it is empty", () => {
    const evening = groupByPartOfDay(day, "evening").find((g) => g.part === "evening");
    expect(evening?.entries).toEqual([]);
  });

  it("is empty for a day with nothing logged and no current part", () => {
    expect(groupByPartOfDay([], null)).toEqual([]);
  });
});
