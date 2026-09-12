import { describe, expect, it } from "vitest";
import { fromMetres, parseDistanceUnit, toMetres } from "./distance";

describe("toMetres", () => {
  it("scores a longer ride in miles above a shorter one in kilometres", () => {
    expect(toMetres(5, "mi")).toBeGreaterThan(toMetres(5, "km"));
  });

  it("treats a distance with no unit as no distance at all", () => {
    expect(toMetres(7, null)).toBe(0);
  });
});

describe("fromMetres", () => {
  it("round-trips a distance back to the unit it was entered in", () => {
    expect(fromMetres(toMetres(7, "mi"), "mi")).toBeCloseTo(7);
  });

  it("converts across units so two logs of the same ride agree", () => {
    expect(fromMetres(toMetres(1, "km"), "m")).toBeCloseTo(1000);
  });
});

describe("parseDistanceUnit", () => {
  it("rejects a unit it does not recognize rather than guessing one", () => {
    expect(parseDistanceUnit("yards")).toBeNull();
    expect(parseDistanceUnit(undefined)).toBeNull();
    expect(parseDistanceUnit("mi")).toBe("mi");
  });
});
