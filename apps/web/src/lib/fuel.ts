import type { AddFuelEntryBody, FuelEntry, FuelMacros, OptionalGrams } from "@afya/shared";

/** What the user has typed into a protein or calorie field, before it means anything. */
export type AmountDraft = string;

/**
 * The three states a fuel amount field can be in.
 *
 * `blank` is deliberately not the same as zero: "I have not said" and "it is none"
 * look identical once both are the number 0, and telling them apart is what lets a
 * food declare only the number it actually has.
 */
export type Amount = { state: "blank" } | { state: "entered"; value: number } | { state: "invalid" };

export function readAmount(draft: AmountDraft): Amount {
  const trimmed = draft.trim();
  if (trimmed === "") return { state: "blank" };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return { state: "invalid" };
  return { state: "entered", value };
}

/** What a draft is worth in a total. A blank field contributes nothing, which is zero. */
export function amountValue(draft: AmountDraft): number {
  const amount = readAmount(draft);
  return amount.state === "entered" ? amount.value : 0;
}

/**
 * What an optional macro's draft is worth: its number, or null when the field was left
 * blank. Carbs and fat keep "not given" apart from 0 all the way to the database.
 */
export function optionalAmountValue(draft: AmountDraft): OptionalGrams {
  const amount = readAmount(draft);
  return amount.state === "entered" ? amount.value : null;
}

/** An optional macro never gates logging, but unreadable text in it is still not a number. */
export const isUsableOptionalAmount = (amount: Amount): boolean => amount.state !== "invalid";

export function bumpAmount(draft: AmountDraft, by: number): AmountDraft {
  return String(Math.max(0, amountValue(draft) + by));
}

/**
 * Whether a food can be logged with these two amounts.
 *
 * A food only has to declare one of its numbers. Olive oil is 0 g of protein and black
 * coffee is 0 kcal; requiring both to be positive made either impossible to log at all,
 * and the workaround — entering 0.1 — put fiction into the totals it was invented to
 * protect. Both blank is still nothing to log, and unreadable text is never a number.
 */
export function canLogAmounts(protein: Amount, calories: Amount): boolean {
  if (protein.state === "invalid" || calories.state === "invalid") return false;
  return protein.state === "entered" || calories.state === "entered";
}

/**
 * Whether a nutrition target is usable. Unlike a food, a target of zero is a mistake
 * rather than a fact — nobody is aiming at 0 kcal — so both halves must be positive.
 */
export function isUsableTarget(draft: AmountDraft): boolean {
  const amount = readAmount(draft);
  return amount.state === "entered" && amount.value > 0;
}

/**
 * What a food is worth, for display: `42p · 58c · 18f · 560kcal`.
 *
 * A zero is omitted rather than printed, because after a food was allowed to declare
 * only one of its numbers, `0p · 5kcal` states a fact about black coffee that reads
 * like a missing value. Carbs and fat that were not given are omitted for the same
 * reason. Everything empty renders as nothing at all. Every number is rounded; a
 * quick-add chip that hides one is how a tap could move a total without ever showing
 * the number (ISS-010).
 */
export function fuelMacroSummary(food: FuelMacros): string {
  const grams = (value: OptionalGrams, suffix: string) => {
    const rounded = Math.round(value ?? 0);
    return rounded > 0 && `${rounded}${suffix}`;
  };
  const parts = [grams(food.proteinG, "p"), grams(food.carbsG, "c"), grams(food.fatG, "f"), grams(food.calories, "kcal")];
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

/** A food as typed into the log or edit form, every number still a draft. */
export interface FoodDraft {
  label: string;
  proteinG: AmountDraft;
  calories: AmountDraft;
  carbsG: AmountDraft;
  fatG: AmountDraft;
}

export const EMPTY_FOOD_DRAFT: FoodDraft = { label: "", proteinG: "", calories: "", carbsG: "", fatG: "" };

/** Whether a draft can be logged: it needs a name and protein or calories; carbs and fat only need to be readable. */
export function canLogFood(draft: FoodDraft): boolean {
  return (
    draft.label.trim() !== "" &&
    canLogAmounts(readAmount(draft.proteinG), readAmount(draft.calories)) &&
    isUsableOptionalAmount(readAmount(draft.carbsG)) &&
    isUsableOptionalAmount(readAmount(draft.fatG))
  );
}

export function foodBody(draft: FoodDraft): AddFuelEntryBody {
  return {
    label: draft.label.trim(),
    proteinG: amountValue(draft.proteinG),
    calories: amountValue(draft.calories),
    carbsG: optionalAmountValue(draft.carbsG),
    fatG: optionalAmountValue(draft.fatG),
  };
}

/**
 * An entry reopened for correction. A stored 0 of protein or calories was a blank when it
 * was logged, so it reopens blank. Carbs and fat kept the difference, so a 0 there reopens
 * as 0 and only "not given" reopens blank.
 */
export function foodDraftFrom(entry: FuelEntry): FoodDraft {
  const required = (value: number) => (value > 0 ? String(value) : "");
  const optional = (value: OptionalGrams) => (value === null ? "" : String(value));
  return {
    label: entry.label,
    proteinG: required(entry.proteinG),
    calories: required(entry.calories),
    carbsG: optional(entry.carbsG),
    fatG: optional(entry.fatG),
  };
}
