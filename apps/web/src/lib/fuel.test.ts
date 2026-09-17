import { describe, expect, it } from "vitest";
import { amountValue, bumpAmount, canLogAmounts, isUsableTarget, readAmount } from "./fuel";

describe("readAmount", () => {
  it("reads an empty field as blank rather than as zero", () => {
    expect(readAmount("")).toEqual({ state: "blank" });
    expect(readAmount("   ")).toEqual({ state: "blank" });
  });

  it("reads zero as a number the user actually entered", () => {
    expect(readAmount("0")).toEqual({ state: "entered", value: 0 });
  });

  it("reads a decimal", () => {
    expect(readAmount("12.5")).toEqual({ state: "entered", value: 12.5 });
  });

  it("rejects text that is not a number", () => {
    expect(readAmount("abc")).toEqual({ state: "invalid" });
    expect(readAmount("12g")).toEqual({ state: "invalid" });
  });

  it("rejects a negative amount", () => {
    expect(readAmount("-5")).toEqual({ state: "invalid" });
  });
});

describe("amountValue", () => {
  it("counts a blank field as nothing", () => {
    expect(amountValue("")).toBe(0);
  });

  it("counts unreadable text as nothing rather than NaN", () => {
    expect(amountValue("abc")).toBe(0);
  });

  it("counts what was entered", () => {
    expect(amountValue("30")).toBe(30);
  });
});

describe("bumpAmount", () => {
  it("steps up from a blank field", () => {
    expect(bumpAmount("", 50)).toBe("50");
  });

  it("does not step below zero", () => {
    expect(bumpAmount("20", -50)).toBe("0");
  });
});

describe("canLogAmounts", () => {
  it("logs a food with no protein", () => {
    // Olive oil, rice, a beer — most of what anyone eats has no protein worth counting.
    expect(canLogAmounts(readAmount(""), readAmount("120"))).toBe(true);
    expect(canLogAmounts(readAmount("0"), readAmount("120"))).toBe(true);
  });

  it("logs a food with no calories", () => {
    // Black coffee, diet soda, greens.
    expect(canLogAmounts(readAmount("0"), readAmount("0"))).toBe(true);
    expect(canLogAmounts(readAmount("25"), readAmount("0"))).toBe(true);
  });

  it("refuses an entry that declares neither number", () => {
    expect(canLogAmounts(readAmount(""), readAmount(""))).toBe(false);
  });

  it("refuses an unreadable or negative amount", () => {
    expect(canLogAmounts(readAmount("abc"), readAmount("120"))).toBe(false);
    expect(canLogAmounts(readAmount("30"), readAmount("-1"))).toBe(false);
  });
});

describe("isUsableTarget", () => {
  it("accepts a positive target", () => {
    expect(isUsableTarget("2600")).toBe(true);
  });

  it("refuses a target of zero, which is a mistake rather than a fact", () => {
    expect(isUsableTarget("0")).toBe(false);
  });

  it("refuses a blank or unreadable target", () => {
    expect(isUsableTarget("")).toBe(false);
    expect(isUsableTarget("abc")).toBe(false);
  });
});
