import { describe, expect, it } from "vitest";
import {
  earliestFuelDate,
  fromDateTimeLocal,
  fuelDayHeading,
  localDateOf,
  loggedAtFor,
  shiftLocalDate,
  toDateTimeLocal,
} from "./fuel-date";

describe("shiftLocalDate", () => {
  it("steps back across a month and a year end", () => {
    expect(shiftLocalDate("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftLocalDate("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("steps forward across a leap day", () => {
    expect(shiftLocalDate("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("earliestFuelDate", () => {
  it("is thirty calendar days back, matching the API's window", () => {
    expect(earliestFuelDate("2026-09-26")).toBe("2026-08-27");
  });
});

describe("fuelDayHeading", () => {
  it("names today and yesterday", () => {
    expect(fuelDayHeading("2026-09-26", "2026-09-26")).toBe("Today");
    expect(fuelDayHeading("2026-09-25", "2026-09-26")).toBe("Yesterday");
  });

  it("gives the weekday and date for anything earlier", () => {
    expect(fuelDayHeading("2026-09-24", "2026-09-26")).toBe("Thu, Sep 24");
  });
});

describe("loggedAtFor", () => {
  const now = new Date(2026, 8, 26, 21, 15); // 21:15 local on Sep 26

  it("leaves today's time to the server", () => {
    expect(loggedAtFor("2026-09-26", now)).toBeUndefined();
  });

  it("puts a past day's entry on that day, at the current clock time", () => {
    const at = new Date(loggedAtFor("2026-09-24", now) ?? "");
    expect(localDateOf(at)).toBe("2026-09-24");
    expect([at.getHours(), at.getMinutes()]).toEqual([21, 15]);
  });
});

describe("datetime-local round trip", () => {
  it("shows an instant in local wall time and reads it back unchanged", () => {
    const iso = new Date(2026, 8, 25, 19, 40).toISOString();
    expect(toDateTimeLocal(iso)).toBe("2026-09-25T19:40");
    expect(fromDateTimeLocal(toDateTimeLocal(iso))).toBe(iso);
  });

  it("reads an empty or partial value as nothing", () => {
    expect(fromDateTimeLocal("")).toBeNull();
    expect(fromDateTimeLocal("2026-09-25")).toBeNull();
  });
});
