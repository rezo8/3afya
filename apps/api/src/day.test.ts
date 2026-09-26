import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  isSameDay,
  localDate,
  shiftLocalDate,
  parseLocalDate,
  parseTimeZone,
  startOfDay,
  startOfDaysAgo,
  startOfLocalDate,
} from "./day";

const NEW_YORK = "America/New_York";
const KIRITIMATI = "Pacific/Kiritimati"; // UTC+14, the far side of the date line

describe("parseTimeZone", () => {
  it("rejects anything the platform doesn't recognize rather than guessing", () => {
    expect(parseTimeZone("Mars/Olympus_Mons")).toBeNull();
    expect(parseTimeZone("-05:00")).toBeNull(); // Intl accepts this; an offset has no DST rule
    expect(parseTimeZone("+0530")).toBeNull();
    expect(parseTimeZone("")).toBeNull();
    expect(parseTimeZone(undefined)).toBeNull();
    expect(parseTimeZone(42)).toBeNull();
  });

  it("accepts an IANA zone name", () => {
    expect(parseTimeZone(NEW_YORK)).toBe(NEW_YORK);
    expect(parseTimeZone(DEFAULT_TIME_ZONE)).toBe(DEFAULT_TIME_ZONE);
  });
});

describe("localDate", () => {
  it("puts a late-evening entry on the day it was actually eaten", () => {
    // 01:30 UTC on the 12th is 21:30 on the 11th in New York — the exact case that made
    // yesterday's dinner show up on today's counter.
    const lateDinner = new Date("2026-09-12T01:30:00Z");

    expect(localDate(lateDinner, "UTC")).toBe("2026-09-12");
    expect(localDate(lateDinner, NEW_YORK)).toBe("2026-09-11");
  });

  it("rolls a day early east of UTC", () => {
    const instant = new Date("2026-09-11T12:00:00Z");

    expect(localDate(instant, KIRITIMATI)).toBe("2026-09-12");
  });
});

describe("startOfDay", () => {
  it("returns the instant local midnight actually happened", () => {
    const afternoon = new Date("2026-09-11T18:00:00Z"); // 14:00 in New York (EDT, UTC-4)

    expect(startOfDay(afternoon, NEW_YORK).toISOString()).toBe("2026-09-11T04:00:00.000Z");
  });

  it("lands on real midnight on a spring-forward day", () => {
    // 2026-03-08 is the US DST transition: the day is 23 hours long and the offset at
    // midnight (-05:00) differs from the offset later that day (-04:00).
    const afterTransition = new Date("2026-03-08T20:00:00Z"); // 16:00 EDT

    expect(startOfDay(afterTransition, NEW_YORK).toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("lands on real midnight on a fall-back day", () => {
    const afterTransition = new Date("2026-11-01T20:00:00Z"); // 15:00 EST, a 25-hour day

    expect(startOfDay(afterTransition, NEW_YORK).toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("is idempotent: the start of a day is its own day's start", () => {
    const start = startOfDay(new Date("2026-09-11T18:00:00Z"), NEW_YORK);

    expect(startOfDay(start, NEW_YORK).toISOString()).toBe(start.toISOString());
  });
});

describe("isSameDay", () => {
  it("separates two instants that share a UTC day but not a local one", () => {
    const beforeLocalMidnight = new Date("2026-09-12T01:00:00Z"); // 21:00 Sep 11 in NY
    const afterLocalMidnight = new Date("2026-09-12T05:00:00Z"); // 01:00 Sep 12 in NY

    expect(isSameDay(beforeLocalMidnight, afterLocalMidnight, "UTC")).toBe(true);
    expect(isSameDay(beforeLocalMidnight, afterLocalMidnight, NEW_YORK)).toBe(false);
  });
});

describe("startOfDaysAgo", () => {
  it("returns a real local midnight for every step back", () => {
    const zone = NEW_YORK;

    for (let i = 0; i < 10; i++) {
      const start = startOfDaysAgo(i, zone);
      expect(startOfDay(start, zone).toISOString()).toBe(start.toISOString());
    }
  });

  it("walks consecutive calendar dates with no gaps or repeats", () => {
    const zone = NEW_YORK;
    const from = new Date("2026-03-12T18:00:00Z"); // the week containing the DST transition

    const dates = Array.from({ length: 7 }, (_, i) => localDate(startOfDaysAgo(i, zone, from), zone));

    expect(dates).toEqual([
      "2026-03-12",
      "2026-03-11",
      "2026-03-10",
      "2026-03-09",
      "2026-03-08", // the 23-hour day: 24h arithmetic skips straight past it
      "2026-03-07",
      "2026-03-06",
    ]);
  });

  it("steps back across a spring-forward boundary without losing a day", () => {
    // 2026-03-08 is the US transition, so Mar 9 local midnight is EDT (-4) while Mar 8's is
    // EST (-5). Subtracting 24h from Mar 9 midnight lands at 23:00 on Mar 7, which reads as
    // the wrong calendar date; stepping back on the calendar does not.
    const afterTransition = new Date("2026-03-09T18:00:00Z"); // 14:00 EDT on the 9th

    const dayBefore = startOfDaysAgo(1, NEW_YORK, afterTransition);
    const twoBefore = startOfDaysAgo(2, NEW_YORK, afterTransition);

    expect(localDate(dayBefore, NEW_YORK)).toBe("2026-03-08");
    expect(dayBefore.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(localDate(twoBefore, NEW_YORK)).toBe("2026-03-07");
  });

  it("treats zero days ago as today's midnight", () => {
    expect(startOfDaysAgo(0, NEW_YORK).toISOString()).toBe(startOfDay(new Date(), NEW_YORK).toISOString());
  });
});

describe("parseLocalDate", () => {
  it("accepts a real calendar date", () => {
    expect(parseLocalDate("2026-09-26")).toBe("2026-09-26");
    expect(parseLocalDate("2028-02-29")).toBe("2028-02-29");
  });

  it("refuses a date that has the shape but does not exist", () => {
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("2027-02-29")).toBeNull();
  });

  it("refuses anything that is not YYYY-MM-DD", () => {
    expect(parseLocalDate("26/09/2026")).toBeNull();
    expect(parseLocalDate("2026-9-26")).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
  });
});

describe("startOfLocalDate", () => {
  it("is midnight of that date in the user's zone", () => {
    expect(startOfLocalDate("2026-09-26", NEW_YORK).toISOString()).toBe("2026-09-26T04:00:00.000Z");
  });

  it("follows the offset in force that day, not today's", () => {
    // New York is on EST (UTC-5) in January.
    expect(startOfLocalDate("2026-01-15", NEW_YORK).toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });
});

describe("shiftLocalDate", () => {
  it("steps across a month end and a leap day", () => {
    expect(shiftLocalDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftLocalDate("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("steps back across a year end", () => {
    expect(shiftLocalDate("2027-01-01", -1)).toBe("2026-12-31");
  });
});
