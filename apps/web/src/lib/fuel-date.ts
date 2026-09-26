import { FUEL_BACKDATE_DAYS } from "@afya/shared";

/**
 * Calendar days for the Fuel page, as YYYY-MM-DD in the browser's zone — which is the user's
 * zone, the same one every request sends as `?tz=`. Stepping is calendar arithmetic on the
 * date itself, never ±24 hours on an instant, so a DST change can't skip or repeat a day.
 */
export type LocalDate = string;

const pad = (n: number) => String(n).padStart(2, "0");

export const localDateOf = (instant: Date): LocalDate =>
  `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;

const partsOf = (date: LocalDate): [number, number, number] => {
  const [year, month, day] = date.split("-").map(Number);
  return [year ?? 1970, month ?? 1, day ?? 1];
};

export function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = partsOf(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The first day the API will accept, counted back from `today`. */
export const earliestFuelDate = (today: LocalDate): LocalDate => shiftLocalDate(today, -FUEL_BACKDATE_DAYS);

/** "Today", "Yesterday", or the weekday and date. */
export function fuelDayHeading(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Today";
  if (date === shiftLocalDate(today, -1)) return "Yesterday";
  const [year, month, day] = partsOf(date);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * When something logged while looking at `date` was eaten. On today it is simply now, which
 * the server fills in. On a past day it is that day at the current clock time: the best guess
 * available until the entry is retimed, and one that keeps it on the day the user chose.
 */
export function loggedAtFor(date: LocalDate, now: Date): string | undefined {
  if (date === localDateOf(now)) return undefined;
  const [year, month, day] = partsOf(date);
  return new Date(year, month - 1, day, now.getHours(), now.getMinutes()).toISOString();
}

/** An ISO instant as the value a `datetime-local` input shows: local wall time, to the minute. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${localDateOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value back to an ISO instant, or null while it is empty or half-typed. */
export function fromDateTimeLocal(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}
