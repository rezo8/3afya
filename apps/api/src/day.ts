/**
 * Calendar days in the user's timezone.
 *
 * A day boundary is a question about where the user is, not where the server runs.
 * `setHours(0,0,0,0)` and `getDate()` answer it with the server process's zone — UTC on
 * Cloud Run — so a user in UTC-5 rolled over at 20:00 and nothing reset at their midnight.
 * Every "is this today" question in the app resolves through this module instead, against
 * an IANA zone the client sends per request.
 *
 * An IANA name rather than a UTC offset on purpose: an offset is one sample of a DST rule,
 * so bucketing a June day against an offset captured in December moves that day's boundary
 * by an hour. `America/New_York` carries the rule; `-05:00` carries one reading of it.
 */

/** Used when the client sends no usable zone. UTC keeps the previous behaviour. */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * The caller's zone if it is an IANA name the platform recognizes, else null — never a guess.
 *
 * `Intl` also accepts offset forms like `-05:00`, which is precisely what must not be honoured
 * here: an offset would pass validation and then silently bucket historical days an hour out
 * across every DST boundary. An IANA name always begins with a letter and an offset never does,
 * so the sign check is what separates them before `Intl` ever sees the value.
 */
export function parseTimeZone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const zone = value.trim();
  if (!/^[A-Za-z]/.test(zone) || zone.includes(":")) return null;
  try {
    // Constructing with an unknown timeZone is what rejects it; the formatter is discarded.
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

/**
 * Formatters are expensive to construct and resolving one day costs several, so they are
 * built once per zone. Keyed only by values `parseTimeZone` already accepted, so the map is
 * bounded by the IANA zone list rather than by anything a caller can invent.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (zone: string): Intl.DateTimeFormat => {
  const cached = formatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(zone, formatter);
  return formatter;
};

const partsIn = (instant: Date, zone: string): ZonedParts => {
  const formatted = formatterFor(zone).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((p) => p.type === type)?.value ?? "0");
  // Midnight formats as hour 24 in some ICU versions; 24:00 of a day is 00:00 of it.
  const hour = read("hour") % 24;
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour,
    minute: read("minute"),
    second: read("second"),
  };
};

/** How far `zone` is from UTC at this instant, in milliseconds. */
const offsetAt = (instant: Date, zone: string): number => {
  const p = partsIn(instant, zone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, instant.getUTCMilliseconds());
  return asIfUtc - instant.getTime();
};

/** The calendar date in `zone`, as YYYY-MM-DD. */
export function localDate(instant: Date, zone: string): string {
  const { year, month, day } = partsIn(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The instant at which a given calendar date began in `zone`.
 *
 * Resolved in two passes because the offset that applies at midnight is not always the one
 * that applies now: on a DST transition day the first guess lands an hour out, and the
 * second pass corrects it using the offset actually in force at the computed instant.
 */
function startOfCalendarDate(year: number, month: number, day: number, zone: string, near: Date): Date {
  const midnightAsIfUtc = Date.UTC(year, month - 1, day);
  const firstGuess = midnightAsIfUtc - offsetAt(near, zone);
  return new Date(midnightAsIfUtc - offsetAt(new Date(firstGuess), zone));
}

/** The instant at which the calendar day containing `instant` began in `zone`. */
export function startOfDay(instant: Date, zone: string): Date {
  const { year, month, day } = partsIn(instant, zone);
  return startOfCalendarDate(year, month, day, zone, instant);
}

/** Do both instants fall on the same calendar day in `zone`? */
export const isSameDay = (a: Date, b: Date, zone: string): boolean => localDate(a, zone) === localDate(b, zone);

/** Is this instant on today's calendar day in `zone`? */
export const isToday = (instant: Date, zone: string): boolean => isSameDay(instant, new Date(), zone);

/**
 * Midnight `daysAgo` calendar days before today, in `zone`.
 *
 * Steps back on the CALENDAR, not by 86_400_000 ms. Subtracting 24 hours from a local
 * midnight lands at 23:00 the day before across a spring-forward boundary, which reads as
 * the wrong date; `Date.UTC` does exact calendar arithmetic and the result is then resolved
 * back to a real local midnight.
 */
export function startOfDaysAgo(daysAgo: number, zone: string, from: Date = new Date()): Date {
  const today = partsIn(from, zone);
  const target = new Date(Date.UTC(today.year, today.month - 1, today.day - daysAgo));
  return startOfCalendarDate(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), zone, from);
}
