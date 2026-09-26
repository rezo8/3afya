import { describe, expect, it } from "vitest";
import type { SetLog } from "@afya/shared";
import { compareToPreviousSession, matchingPreviousSet, type SetEntry } from "./set-comparison";

const set = (setNumber: number, fields: Partial<SetLog> = {}): SetLog => ({
  id: `set-${setNumber}`,
  exerciseId: "ex-1",
  setNumber,
  weight: 0,
  reps: 0,
  durationSec: 0,
  distance: 0,
  distanceUnit: null,
  isWarmup: false,
  completedAt: "2026-09-20T10:00:00.000Z",
  ...fields,
});

const entry = (fields: Partial<SetEntry> = {}): SetEntry => ({
  weight: 0,
  reps: 0,
  durationSec: 0,
  distance: 0,
  distanceUnit: "mi",
  ...fields,
});

/** Last session: a fresh 225, then fatigue. */
const previousSquat = [set(1, { weight: 225 }), set(2, { weight: 215 }), set(3, { weight: 205 })];

describe("matchingPreviousSet", () => {
  it("returns the previous first set before anything is logged today", () => {
    expect(matchingPreviousSet(previousSquat, [])?.weight).toBe(225);
  });

  it("returns the set at the position the next working set will fill", () => {
    expect(matchingPreviousSet(previousSquat, [set(1), set(2)])?.weight).toBe(205);
  });

  it("does not count today's warm-ups toward the position", () => {
    const today = [set(1, { isWarmup: true }), set(2, { isWarmup: true }), set(3)];
    expect(matchingPreviousSet(previousSquat, today)?.weight).toBe(215);
  });

  it("is null once today has more working sets than last time", () => {
    expect(matchingPreviousSet(previousSquat, [set(1), set(2), set(3)])).toBeNull();
  });
});

describe("compareToPreviousSession", () => {
  const compare = (overrides: Partial<Parameters<typeof compareToPreviousSession>[0]>) =>
    compareToPreviousSession({
      exerciseKind: "weighted",
      entry: entry(),
      isWarmup: false,
      previousWorkingSets: previousSquat,
      loggedSets: [],
      ...overrides,
    });

  it("scores a fresh first set against last time's first set, not its last", () => {
    expect(compare({ entry: entry({ weight: 225 }) })).toEqual({ kind: "delta", position: 1, delta: 0, unit: "lb" });
  });

  it("scores a later set against the same position last time", () => {
    const comparison = compare({ entry: entry({ weight: 210 }), loggedSets: [set(1), set(2)] });
    expect(comparison).toEqual({ kind: "delta", position: 3, delta: 5, unit: "lb" });
  });

  it("reports first time when the exercise has no previous working sets", () => {
    expect(compare({ previousWorkingSets: [] })).toEqual({ kind: "first-time" });
  });

  it("does not compare a warm-up against a working set", () => {
    expect(compare({ isWarmup: true })).toEqual({ kind: "warmup" });
  });

  it("says there is no matching set for an extra set rather than falling back to the last one", () => {
    expect(compare({ loggedSets: [set(1), set(2), set(3)] })).toEqual({ kind: "no-matching-set", position: 4 });
  });

  it("compares reps for a reps exercise", () => {
    const comparison = compare({
      exerciseKind: "reps",
      entry: entry({ reps: 12 }),
      previousWorkingSets: [set(1, { reps: 15 })],
    });
    expect(comparison).toEqual({ kind: "delta", position: 1, delta: -3, unit: "reps" });
  });

  it("compares seconds for a time exercise", () => {
    const comparison = compare({
      exerciseKind: "time",
      entry: entry({ durationSec: 75 }),
      previousWorkingSets: [set(1, { durationSec: 60 })],
    });
    expect(comparison).toEqual({ kind: "delta", position: 1, delta: 15, unit: "s" });
  });

  it("compares distance in the unit both sets share", () => {
    const comparison = compare({
      exerciseKind: "distance",
      entry: entry({ distance: 7.5, distanceUnit: "mi" }),
      previousWorkingSets: [set(1, { distance: 7, distanceUnit: "mi" })],
    });
    expect(comparison).toEqual({ kind: "delta", position: 1, delta: 0.5, unit: "mi" });
  });

  it("leaves a cross-unit distance unsaid instead of converting it", () => {
    const comparison = compare({
      exerciseKind: "distance",
      entry: entry({ distance: 10, distanceUnit: "km" }),
      previousWorkingSets: [set(1, { distance: 7, distanceUnit: "mi" })],
    });
    expect(comparison).toEqual({ kind: "different-unit", previousUnit: "mi" });
  });
});
