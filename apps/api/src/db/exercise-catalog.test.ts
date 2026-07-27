import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG, catalogForMuscleGroup, findCatalogExercise } from "./exercise-catalog";

describe("EXERCISE_CATALOG", () => {
  it("holds no duplicate names, case-insensitively", () => {
    const lowerNames = EXERCISE_CATALOG.map((entry) => entry.name.toLowerCase());
    const duplicates = lowerNames.filter((name, i) => lowerNames.indexOf(name) !== i);

    expect(duplicates).toEqual([]);
  });

  it("stores every name trimmed, so a lookup can trim the caller's input and match", () => {
    const untrimmed = EXERCISE_CATALOG.filter((entry) => entry.name !== entry.name.trim());

    expect(untrimmed).toEqual([]);
  });
});

describe("findCatalogExercise", () => {
  it("matches regardless of case and surrounding whitespace", () => {
    expect(findCatalogExercise("  dumbbell BENCH press ")?.name).toBe("Dumbbell Bench Press");
  });

  it("returns null for a name the catalog does not list verbatim, rather than matching loosely", () => {
    // "Incline DB Press" and "Bench Press" are real names users type; neither is in the
    // catalog, and abbreviating or dropping words must never resolve to a near neighbor.
    expect(findCatalogExercise("Incline DB Press")).toBeNull();
    expect(findCatalogExercise("Bench Press")).toBeNull();
    expect(findCatalogExercise("Barbell Bench Pres")).toBeNull();
  });
});

describe("catalogForMuscleGroup", () => {
  it("returns only entries of that group", () => {
    const chest = catalogForMuscleGroup("chest");

    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((entry) => entry.primaryMuscleGroup === "chest")).toBe(true);
  });
});
