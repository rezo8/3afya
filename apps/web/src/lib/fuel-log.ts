import type { FuelEntry } from "@afya/shared";

/**
 * Parts of the day a fuel log reads in. Derived from when each entry was eaten, in the
 * browser's zone (the user's), rather than stored: there is no meal column to keep honest,
 * and moving an entry's time moves it between parts on its own.
 */
export type PartOfDay = "morning" | "midday" | "afternoon" | "evening";

const PARTS: readonly PartOfDay[] = ["morning", "midday", "afternoon", "evening"];

export const PART_LABEL: Record<PartOfDay, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

/** Local hours at which each part after morning begins. */
const MIDDAY_FROM = 11;
const AFTERNOON_FROM = 15;
const EVENING_FROM = 18;

export function partOfDay(instant: Date): PartOfDay {
  const hour = instant.getHours();
  if (hour < MIDDAY_FROM) return "morning";
  if (hour < AFTERNOON_FROM) return "midday";
  if (hour < EVENING_FROM) return "afternoon";
  return "evening";
}

export interface LogGroup {
  part: PartOfDay;
  /** In the order they were eaten. */
  entries: FuelEntry[];
  proteinG: number;
  calories: number;
}

/**
 * A day's entries as parts of the day, in order. Empty parts are left out, except the one
 * the user is in now on today, which stays so the page shows where the next entry will go.
 */
export function groupByPartOfDay(entries: FuelEntry[], currentPart: PartOfDay | null): LogGroup[] {
  const chronological = [...entries].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  return PARTS.map((part) => {
    const inPart = chronological.filter((e) => partOfDay(new Date(e.loggedAt)) === part);
    return {
      part,
      entries: inPart,
      proteinG: inPart.reduce((sum, e) => sum + e.proteinG, 0),
      calories: inPart.reduce((sum, e) => sum + e.calories, 0),
    };
  }).filter((group) => group.entries.length > 0 || group.part === currentPart);
}
