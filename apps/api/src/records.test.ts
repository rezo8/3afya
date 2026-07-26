import { describe, expect, it } from "vitest";
import { computeRecords, detectPrs, type RecordSet } from "./records";

const set = (overrides: Partial<RecordSet>): RecordSet => ({
  id: "set-id",
  weight: 0,
  reps: 0,
  durationSec: 0,
  isWarmup: false,
  completedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

describe("computeRecords", () => {
  it("excludes a higher-scoring warm-up set from becoming the recorded PR entry", () => {
    const warmup = set({ id: "warmup", weight: 200, reps: 10, isWarmup: true });
    const working = set({ id: "working", weight: 135, reps: 8, isWarmup: false });

    const records = computeRecords("weighted", [warmup, working]);

    const weightPr = records.find((r) => r.kind === "weight");
    expect(weightPr?.setId).toBe("working");
    expect(weightPr?.value).toBe(135);
  });
});

describe("detectPrs", () => {
  it("reports no new PR when only a warm-up set numerically exceeds prior bests", () => {
    const priorSets = [set({ id: "prior", weight: 135, reps: 8 })];
    const warmupSet = set({ id: "new-warmup", weight: 200, reps: 10, isWarmup: true });

    const prs = detectPrs("weighted", priorSets, warmupSet);

    expect(prs).toEqual([]);
  });

  it("still correctly reports a new PR from a genuine working set that exceeds prior bests", () => {
    const priorSets = [set({ id: "prior", weight: 135, reps: 8 })];
    const newWorkingSet = set({ id: "new-working", weight: 145, reps: 8, isWarmup: false });

    const prs = detectPrs("weighted", priorSets, newWorkingSet);

    expect(prs).toContain("weight");
  });
});
