import { describe, expect, it } from "vitest";
import type { Equipment, ExerciseAlternative } from "@afya/shared";
import { rankAlternatives } from "./exercise-alternatives";

const alternative = (name: string, equipment: Equipment, inLibrary: boolean): ExerciseAlternative => ({
  id: inLibrary ? `id-${name}` : null,
  name,
  kind: "weighted",
  primaryMuscleGroup: "chest",
  equipment,
  inLibrary,
});

describe("rankAlternatives", () => {
  it("puts alternatives on different equipment ahead of ones on the same equipment", () => {
    const fromLibrary = [
      alternative("Another Barbell Lift", "barbell", true),
      alternative("Zzz Cable Lift", "cable", true),
    ];

    const ranked = rankAlternatives({ replacing: "barbell", fromLibrary, fromCatalog: [] });

    expect(ranked.map((a) => a.name)).toEqual(["Zzz Cable Lift", "Another Barbell Lift"]);
  });

  it("keeps the whole library ahead of catalog suggestions, even a same-equipment one", () => {
    const fromLibrary = [alternative("Library Barbell Lift", "barbell", true)];
    const fromCatalog = [alternative("Catalog Cable Lift", "cable", false)];

    const ranked = rankAlternatives({ replacing: "barbell", fromLibrary, fromCatalog });

    expect(ranked.map((a) => a.name)).toEqual(["Library Barbell Lift", "Catalog Cable Lift"]);
  });

  it("breaks equipment ties alphabetically", () => {
    const fromCatalog = [
      alternative("Machine Chest Press", "machine", false),
      alternative("Dumbbell Bench Press", "dumbbell", false),
      alternative("Cable Fly", "cable", false),
    ];

    const ranked = rankAlternatives({ replacing: "barbell", fromLibrary: [], fromCatalog });

    expect(ranked.map((a) => a.name)).toEqual(["Cable Fly", "Dumbbell Bench Press", "Machine Chest Press"]);
  });

  it("caps the list at the limit, dropping catalog suggestions before library entries", () => {
    const fromLibrary = [alternative("Owned Lift", "cable", true)];
    const fromCatalog = [alternative("Suggested Lift", "machine", false)];

    const ranked = rankAlternatives({ replacing: "barbell", fromLibrary, fromCatalog, limit: 1 });

    expect(ranked.map((a) => a.name)).toEqual(["Owned Lift"]);
  });

  it("treats untagged equipment as the same equipment when the replaced exercise has none", () => {
    const fromCatalog = [
      alternative("Known Equipment", "cable", false),
      { ...alternative("Unknown Equipment", "cable", false), equipment: null },
    ];

    const ranked = rankAlternatives({ replacing: null, fromLibrary: [], fromCatalog });

    expect(ranked.map((a) => a.name)).toEqual(["Known Equipment", "Unknown Equipment"]);
  });

  it("does not mutate the input arrays", () => {
    const fromLibrary = [alternative("Zzz Lift", "cable", true), alternative("Aaa Lift", "cable", true)];

    rankAlternatives({ replacing: "barbell", fromLibrary, fromCatalog: [] });

    expect(fromLibrary.map((a) => a.name)).toEqual(["Zzz Lift", "Aaa Lift"]);
  });
});
