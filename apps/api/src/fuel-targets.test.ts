import { describe, expect, it } from "vitest";
import type { NutritionTarget } from "@afya/shared";
import { targetInForce, targetPeriods, type TargetRow } from "./fuel-targets";

const FALLBACK: NutritionTarget = { proteinG: 180, calories: 2600, carbsG: null, fatG: null };
const row = (iso: string, calories: number): TargetRow => ({
  proteinG: 180,
  calories,
  carbsG: null,
  fatG: null,
  createdAt: new Date(iso),
});
const rows = [row("2026-09-03T15:00:00Z", 2850), row("2026-07-12T15:00:00Z", 2600)];

describe("targetInForce", () => {
  it("uses the newest target set before the day ended", () => {
    expect(targetInForce(rows, new Date("2026-09-20T04:00:00Z"), FALLBACK).calories).toBe(2850);
  });

  it("judges a day before a change by the target it had then", () => {
    expect(targetInForce(rows, new Date("2026-08-20T04:00:00Z"), FALLBACK).calories).toBe(2600);
  });

  it("applies a target changed during a day to that whole day", () => {
    expect(targetInForce(rows, new Date("2026-09-04T04:00:00Z"), FALLBACK).calories).toBe(2850);
  });

  it("falls back for days before any target existed", () => {
    expect(targetInForce(rows, new Date("2026-07-01T04:00:00Z"), FALLBACK)).toEqual(FALLBACK);
  });
});

describe("targetPeriods", () => {
  const NEW_YORK = "America/New_York";

  it("lists periods newest first, each ending the day before the next began", () => {
    expect(targetPeriods(rows, NEW_YORK).map((p) => [p.from, p.to, p.target.calories])).toEqual([
      ["2026-09-03", null, 2850],
      ["2026-07-12", "2026-09-02", 2600],
    ]);
  });

  it("keeps only the last of several edits on one day", () => {
    const sameDay = [row("2026-09-03T14:00:00Z", 2700), row("2026-09-03T20:00:00Z", 2850)];
    expect(targetPeriods(sameDay, NEW_YORK)).toEqual([
      { from: "2026-09-03", to: null, target: { proteinG: 180, calories: 2850, carbsG: null, fatG: null } },
    ]);
  });

  it("merges a save that changed nothing into the period before it", () => {
    const resaved = [row("2026-07-12T15:00:00Z", 2600), row("2026-08-01T15:00:00Z", 2600)];
    expect(targetPeriods(resaved, NEW_YORK)).toHaveLength(1);
  });

  it("dates each period by the user's calendar, not the server's", () => {
    // 02:00 UTC on Sep 4 is still Sep 3 in New York.
    expect(targetPeriods([row("2026-09-04T02:00:00Z", 2850)], NEW_YORK)[0]?.from).toBe("2026-09-03");
  });
});
