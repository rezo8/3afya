import { describe, expect, it } from "vitest";
import type { NutritionTarget } from "@afya/shared";
import { targetInForce, type TargetRow } from "./fuel-targets";

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
