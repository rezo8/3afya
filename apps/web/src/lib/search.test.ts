import { describe, expect, it } from "vitest";
import { matchesQuery, queryTokens } from "./search";

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
