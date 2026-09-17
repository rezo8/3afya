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
 * What a food is worth, for display: `30p · 200kcal`.
 *
 * A zero is omitted rather than printed, because after a food was allowed to declare
 * only one of its numbers, `0p · 5kcal` states a fact about black coffee that reads
 * like a missing value. Both zero renders as nothing at all — the logging path won't
 * produce it (`canLogAmounts`), and an empty summary is the honest reading if it ever
 * does. Both numbers are rounded; a quick-add chip that hides one is how a tap could
 * move the calorie total without ever showing the number (ISS-010).
 */
export function fuelMacroSummary(proteinG: number, calories: number): string {
  const protein = Math.round(proteinG);
  const kcal = Math.round(calories);
  const parts = [protein > 0 && `${protein}p`, kcal > 0 && `${kcal}kcal`].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}
