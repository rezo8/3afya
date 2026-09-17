import { describe, expect, it } from "vitest";
import type { CatalogExercise, Exercise } from "@afya/shared";
import { buildPickerOptions, isNewName, matchesQuery, queryTokens } from "./exercise-pick";

const libraryExercise = (id: string, name: string): Exercise => ({
  id,
  name,
  kind: "weighted",
  primaryMuscleGroup: "chest",
  equipment: "dumbbell",
  createdAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
});

const catalogExercise = (name: string): CatalogExercise => ({
  name,
  kind: "weighted",
  primaryMuscleGroup: "chest",
  equipment: "barbell",
});

describe("matchesQuery", () => {
  it("matches on a substring of a single token", () => {
    expect(matchesQuery("Incline Dumbbell Press", queryTokens("dumb"))).toBe(true);
  });

  it("matches when every token appears, in any order", () => {
    expect(matchesQuery("Incline Dumbbell Press", queryTokens("press inc"))).toBe(true);
  });

  it("does not match an abbreviation the name does not contain", () => {
    expect(matchesQuery("Incline Dumbbell Press", queryTokens("db"))).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(matchesQuery("Incline Dumbbell Press", queryTokens("  INCLINE  "))).toBe(true);
  });

  it("matches everything on an empty query", () => {
    expect(matchesQuery("Anything", queryTokens("   "))).toBe(true);
  });

  it("rejects a name missing one of the tokens", () => {
    expect(matchesQuery("Incline Dumbbell Press", queryTokens("incline squat"))).toBe(false);
  });
});

describe("buildPickerOptions", () => {
  const library = [libraryExercise("ex-1", "Cable Fly"), libraryExercise("ex-2", "Pec Deck")];
  const catalog = [catalogExercise("Barbell Bench Press"), catalogExercise("Cable Fly")];

  it("ranks the pickable library ahead of the catalog", () => {
    const options = buildPickerOptions(library, catalog, new Set());
    expect(options.map((o) => o.name)).toEqual(["Cable Fly", "Pec Deck", "Barbell Bench Press"]);
  });

  it("hides a catalog entry the user already owns under that name", () => {
    const options = buildPickerOptions(library, catalog, new Set());
    expect(options.filter((o) => o.name === "Cable Fly")).toHaveLength(1);
  });

  it("lists what the day already has, but not as something to pick", () => {
    const options = buildPickerOptions(library, catalog, new Set(["ex-1"]));
    const alreadyThere = options.find((o) => o.name === "Cable Fly");
    expect(alreadyThere?.pick).toBeNull();
    expect(alreadyThere?.badge).toBe("in this day");
  });

  it("sinks what the day already has below what it can still add", () => {
    const options = buildPickerOptions(library, catalog, new Set(["ex-1"]));
    expect(options.map((o) => o.name)).toEqual(["Pec Deck", "Cable Fly", "Barbell Bench Press"]);
  });

  it("marks a catalog entry as new and picks it by name, not by id", () => {
    const options = buildPickerOptions(library, catalog, new Set());
    const fromCatalog = options.find((o) => o.name === "Barbell Bench Press");
    expect(fromCatalog?.badge).toBe("new");
    expect(fromCatalog?.pick).toEqual({ source: "catalog", name: "Barbell Bench Press" });
  });
});

describe("isNewName", () => {
  const options = buildPickerOptions([libraryExercise("ex-1", "Cable Fly")], [catalogExercise("Pec Deck")], new Set());

  it("offers creation for a name nothing answers to", () => {
    expect(isNewName("Landmine Press", options)).toBe(true);
  });

  it("does not offer creation for a name already in the library", () => {
    expect(isNewName("  cable fly ", options)).toBe(false);
  });

  it("does not offer creation for a name the catalog already knows", () => {
    expect(isNewName("PEC DECK", options)).toBe(false);
  });

  it("offers nothing for an empty query", () => {
    expect(isNewName("   ", options)).toBe(false);
  });
});
