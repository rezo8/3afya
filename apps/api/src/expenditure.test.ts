import { describe, expect, it } from "vitest";
import { estimateExpenditure, type ExpenditureInput } from "./expenditure";

/** Consecutive YYYY-MM-DD dates from Aug 29, the 28 days before Sep 26. */
const date = (i: number) => new Date(Date.UTC(2026, 7, 29 + i)).toISOString().slice(0, 10);
const days = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Every day logged at `calories`, and a weigh-in every other day on a straight trend. */
function steady(calories: number, lbPerWeek: number, noise: (i: number) => number = () => 0): ExpenditureInput {
  return {
    intake: days(28).map((i) => ({ date: date(i), calories })),
    weighIns: days(14).map((k) => {
      const i = k * 2;
      return { date: date(i), weight: 186 + (lbPerWeek / 7) * i + noise(i) };
    }),
  };
}

describe("estimateExpenditure", () => {
  it("equals intake when the weight trend is flat", () => {
    const result = estimateExpenditure(steady(2200, 0));
    expect(result).toMatchObject({ state: "estimate", kcalPerDay: 2200, trendLbPerWeek: 0 });
  });

  it("is below intake by a pound's energy per pound gained", () => {
    // +0.5 lb/week is 250 kcal/day stored, so 2,700 eaten means 2,450 burned.
    const result = estimateExpenditure(steady(2700, 0.5));
    expect(result).toMatchObject({ state: "estimate", kcalPerDay: 2450, trendLbPerWeek: 0.5 });
  });

  it("is above intake while losing", () => {
    const result = estimateExpenditure(steady(2000, -1));
    expect(result).toMatchObject({ state: "estimate", kcalPerDay: 2500 });
  });

  it("sees through day-to-day water swings", () => {
    const swings = (i: number) => (i % 4 === 0 ? 1.5 : -1.5);
    const result = estimateExpenditure(steady(2200, 0, swings));
    expect(result.state === "estimate" && Math.abs(result.kcalPerDay - 2200)).toBeLessThanOrEqual(150);
  });

  it("averages intake over logged days only, never counting a gap as a fast", () => {
    const input = steady(2200, 0);
    const withGaps = { ...input, intake: input.intake.filter((_, i) => i % 5 !== 0) };
    expect(estimateExpenditure(withGaps)).toMatchObject({ state: "estimate", kcalPerDay: 2200 });
  });

  it("says what is missing instead of guessing from too little food logged", () => {
    const input = steady(2200, 0);
    const result = estimateExpenditure({ ...input, intake: input.intake.slice(0, 10) });
    expect(result.state).toBe("insufficient");
    expect(result.state === "insufficient" && result.reasons[0]).toContain("10 so far");
  });

  it("needs enough weigh-ins, spread over two weeks", () => {
    const input = steady(2200, 0);
    expect(estimateExpenditure({ ...input, weighIns: input.weighIns.slice(0, 5) }).state).toBe("insufficient");
    const bunched = days(8).map((i) => ({ date: date(i), weight: 186 }));
    const result = estimateExpenditure({ ...input, weighIns: bunched });
    expect(result.state === "insufficient" && result.reasons.join(" ")).toContain("two weeks");
  });

  it("refuses an implausible estimate rather than showing it", () => {
    expect(estimateExpenditure(steady(600, 0)).state).toBe("insufficient");
  });

  it("rates confidence by how complete the window is", () => {
    expect(estimateExpenditure(steady(2200, 0))).toMatchObject({ confidence: "moderate" });
    const input = steady(2200, 0);
    const daily = { ...input, weighIns: days(28).map((i) => ({ date: date(i), weight: 186 })) };
    expect(estimateExpenditure(daily)).toMatchObject({ confidence: "good" });
  });
});
