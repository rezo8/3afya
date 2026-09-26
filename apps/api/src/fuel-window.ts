import { FUEL_BACKDATE_DAYS } from "@afya/shared";
import { localDate, startOfDaysAgo } from "./day";

/**
 * Which days fuel can be logged on. A fixed window rather than "any past day": a typo in a
 * date should be refused, not file dinner under 2016.
 *
 * Future times are refused too, with a little slack for a phone clock that runs ahead of
 * the server's.
 */
const CLOCK_SKEW_MS = 5 * 60_000;

/** The earliest calendar date in the window, in `zone`. */
export const earliestFuelDate = (now: Date, zone: string): string =>
  localDate(startOfDaysAgo(FUEL_BACKDATE_DAYS, zone, now), zone);

/** Whether a YYYY-MM-DD date can be viewed or logged on: inside the window and not after today. */
export function isFuelDate(date: string, now: Date, zone: string): boolean {
  return date >= earliestFuelDate(now, zone) && date <= localDate(now, zone);
}

export type LoggedAt = { kind: "now" } | { kind: "at"; instant: Date } | { kind: "refused"; message: string };

/** The time a request says food was eaten, read against the window. Absent means now. */
export function readLoggedAt(value: unknown, now: Date, zone: string): LoggedAt {
  if (value === undefined || value === null) return { kind: "now" };
  const instant = typeof value === "string" ? new Date(value) : null;
  if (!instant || Number.isNaN(instant.getTime())) {
    return { kind: "refused", message: "loggedAt must be an ISO 8601 time." };
  }
  if (instant.getTime() > now.getTime() + CLOCK_SKEW_MS) {
    return { kind: "refused", message: "Food can't be logged in the future." };
  }
  if (localDate(instant, zone) < earliestFuelDate(now, zone)) {
    return { kind: "refused", message: `Food can be logged up to ${FUEL_BACKDATE_DAYS} days back.` };
  }
  return { kind: "at", instant };
}
