import { describe, expect, it } from "vitest";
import type { FuelEntry, FuelMacros } from "@afya/shared";
import {
  amountValue,
  bumpAmount,
  canLogAmounts,
  canLogFood,
  canSaveItem,
  EMPTY_ITEM_DRAFT,
  itemBody,
  servingOf,
  EMPTY_FOOD_DRAFT,
  foodBody,
  foodDraftFrom,
  fuelMacroSummary,
  isUsableOptionalAmount,
  isUsableTarget,
  optionalAmountValue,
  readAmount,
  scaleFood,
  stepPortion,
} from "./fuel";

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

const food = (proteinG: number, calories: number, carbsG: number | null = null, fatG: number | null = null): FuelMacros => ({
  proteinG,
  calories,
  carbsG,
  fatG,
});

describe("fuelMacroSummary", () => {
  it("shows both numbers when a food has both", () => {
    expect(fuelMacroSummary(food(30, 200))).toBe("30p · 200kcal");
  });

  it("omits protein a food does not have", () => {
    expect(fuelMacroSummary(food(0, 5))).toBe("5kcal");
  });

  it("omits calories a food does not have", () => {
    expect(fuelMacroSummary(food(30, 0))).toBe("30p");
  });

  it("says nothing when a food declares neither", () => {
    expect(fuelMacroSummary(food(0, 0))).toBe("");
  });

  it("rounds every number", () => {
    expect(fuelMacroSummary(food(30.4, 200.6, 57.6, 17.5))).toBe("30p · 58c · 18f · 201kcal");
  });

  it("puts carbs and fat between protein and calories", () => {
    expect(fuelMacroSummary(food(42, 560, 58, 18))).toBe("42p · 58c · 18f · 560kcal");
  });

  it("omits carbs and fat that were not given", () => {
    expect(fuelMacroSummary(food(20, 210, null, null))).toBe("20p · 210kcal");
  });
});

describe("optionalAmountValue", () => {
  it("keeps a blank field as not given rather than zero", () => {
    expect(optionalAmountValue("")).toBeNull();
    expect(optionalAmountValue("   ")).toBeNull();
  });

  it("keeps a zero the user actually entered", () => {
    expect(optionalAmountValue("0")).toBe(0);
  });

  it("reads a decimal", () => {
    expect(optionalAmountValue("12.5")).toBe(12.5);
  });

  it("does not turn unreadable text into a number", () => {
    expect(optionalAmountValue("abc")).toBeNull();
  });
});

describe("isUsableOptionalAmount", () => {
  it("accepts a blank field, since carbs and fat are optional", () => {
    expect(isUsableOptionalAmount(readAmount(""))).toBe(true);
  });

  it("accepts an entered number, zero included", () => {
    expect(isUsableOptionalAmount(readAmount("0"))).toBe(true);
    expect(isUsableOptionalAmount(readAmount("40"))).toBe(true);
  });

  it("refuses unreadable or negative text", () => {
    expect(isUsableOptionalAmount(readAmount("abc"))).toBe(false);
    expect(isUsableOptionalAmount(readAmount("-3"))).toBe(false);
  });
});

describe("canLogFood", () => {
  const draft = { ...EMPTY_FOOD_DRAFT, label: "Protein bar", proteinG: "20", calories: "210" };

  it("logs a food that gives only protein and calories", () => {
    expect(canLogFood(draft)).toBe(true);
  });

  it("refuses a food with no name", () => {
    expect(canLogFood({ ...draft, label: "  " })).toBe(false);
  });

  it("refuses unreadable carbs or fat instead of dropping them", () => {
    expect(canLogFood({ ...draft, carbsG: "abc" })).toBe(false);
    expect(canLogFood({ ...draft, fatG: "-2" })).toBe(false);
  });

  it("does not accept carbs and fat in place of protein or calories", () => {
    expect(canLogFood({ ...draft, proteinG: "", calories: "", carbsG: "30", fatG: "10" })).toBe(false);
  });
});

describe("foodBody", () => {
  it("sends carbs and fat that were not given as null, not zero", () => {
    const body = foodBody({ ...EMPTY_FOOD_DRAFT, label: " Protein bar ", proteinG: "20", calories: "210" });
    expect(body).toEqual({ label: "Protein bar", proteinG: 20, calories: 210, carbsG: null, fatG: null });
  });

  it("sends a carbs or fat of zero as zero", () => {
    const body = foodBody({ ...EMPTY_FOOD_DRAFT, label: "Olive oil", calories: "120", carbsG: "0", fatG: "14" });
    expect(body).toMatchObject({ proteinG: 0, carbsG: 0, fatG: 14 });
  });
});

describe("foodDraftFrom", () => {
  const entry = (fields: Partial<FuelEntry>): FuelEntry => ({
    id: "e-1",
    label: "Olive oil",
    proteinG: 0,
    calories: 120,
    carbsG: 0,
    fatG: 14,
    portion: null,
    itemId: null,
    loggedAt: "2026-09-26T12:00:00.000Z",
    ...fields,
  });

  it("reopens zero protein blank, since a blank was stored as zero", () => {
    expect(foodDraftFrom(entry({})).proteinG).toBe("");
  });

  it("reopens zero carbs as zero, since carbs kept the difference", () => {
    expect(foodDraftFrom(entry({})).carbsG).toBe("0");
  });

  it("reopens carbs and fat that were not given as blank", () => {
    const draft = foodDraftFrom(entry({ carbsG: null, fatG: null }));
    expect([draft.carbsG, draft.fatG]).toEqual(["", ""]);
  });

  it("round-trips an entry through a draft unchanged", () => {
    const original = entry({ proteinG: 42, calories: 560, carbsG: 58, fatG: 18, label: "Eggs & oats" });
    expect(foodBody(foodDraftFrom(original))).toEqual({
      label: original.label,
      proteinG: original.proteinG,
      calories: original.calories,
      carbsG: original.carbsG,
      fatG: original.fatG,
    });
  });
});

describe("scaleFood", () => {
  it("doubles every number for a double portion", () => {
    expect(scaleFood(food(62, 700, 80, 14), 2)).toEqual(food(124, 1400, 160, 28));
  });

  it("keeps carbs and fat that were not given as not given", () => {
    expect(scaleFood(food(30, 200), 1.5)).toEqual(food(45, 300, null, null));
  });

  it("rounds grams to a tenth and calories to a whole number", () => {
    expect(scaleFood(food(24.3, 155, 6.7, 2.1), 0.5)).toEqual(food(12.2, 78, 3.4, 1.1));
  });

  it("is the food itself at one portion", () => {
    expect(scaleFood(food(42, 560, 58, 18), 1)).toEqual(food(42, 560, 58, 18));
  });
});

describe("canSaveItem", () => {
  const draft = { ...EMPTY_ITEM_DRAFT, label: "Protein shake", proteinG: "24", calories: "150", unit: "1 scoop" };

  it("saves a food with a name, a number and a unit", () => {
    expect(canSaveItem(draft)).toBe(true);
  });

  it("refuses a food with no unit, since its numbers would be for nothing", () => {
    expect(canSaveItem({ ...draft, unit: "  " })).toBe(false);
  });
});

describe("itemBody", () => {
  it("trims the unit and keeps carbs and fat that were not given as null", () => {
    const body = itemBody({ ...EMPTY_ITEM_DRAFT, label: "Protein shake", proteinG: "24", calories: "150", unit: " 1 scoop " });
    expect(body).toEqual({ label: "Protein shake", unit: "1 scoop", proteinG: 24, calories: 150, carbsG: null, fatG: null });
  });
});

describe("servingOf", () => {
  const entry = (portion: number | null): FuelEntry => ({
    id: "e-1",
    label: "Chicken & rice",
    proteinG: 124,
    calories: 1400,
    carbsG: 160,
    fatG: null,
    portion,
    itemId: null,
    loggedAt: "2026-09-26T12:00:00.000Z",
  });

  it("halves an entry that was two servings", () => {
    expect(servingOf(entry(2))).toEqual({ proteinG: 62, calories: 700, carbsG: 80, fatG: null });
  });

  it("is the entry itself when it was typed by hand", () => {
    expect(servingOf(entry(null))).toEqual({ proteinG: 124, calories: 1400, carbsG: 160, fatG: null });
  });
});

describe("stepPortion", () => {
  it("moves a quarter at a time", () => {
    expect(stepPortion(1, 1)).toBe(1.25);
    expect(stepPortion(1.5, -1)).toBe(1.25);
  });

  it("never goes below a quarter", () => {
    expect(stepPortion(0.25, -1)).toBe(0.25);
  });

  it("stops at the API's ceiling of twenty", () => {
    expect(stepPortion(20, 1)).toBe(20);
  });

  it("snaps an off-grid portion back onto quarters", () => {
    expect(stepPortion(1.1, 1)).toBe(1.25);
  });
});
