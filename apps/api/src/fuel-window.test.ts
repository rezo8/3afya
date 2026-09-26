import { describe, expect, it } from "vitest";
import { earliestFuelDate, isFuelDate, readLoggedAt } from "./fuel-window";

const NEW_YORK = "America/New_York";
// 14:00 in New York on Sep 26.
const NOW = new Date("2026-09-26T18:00:00Z");

describe("earliestFuelDate", () => {
  it("is thirty calendar days before today in the user's zone", () => {
    expect(earliestFuelDate(NOW, NEW_YORK)).toBe("2026-08-27");
  });

  it("counts from the user's today, not the server's", () => {
    // 02:00 UTC on the 27th is still the 26th in New York.
    expect(earliestFuelDate(new Date("2026-09-27T02:00:00Z"), NEW_YORK)).toBe("2026-08-27");
  });
});

describe("isFuelDate", () => {
  it("accepts today and the first day of the window", () => {
    expect(isFuelDate("2026-09-26", NOW, NEW_YORK)).toBe(true);
    expect(isFuelDate("2026-08-27", NOW, NEW_YORK)).toBe(true);
  });

  it("refuses tomorrow and the day before the window", () => {
    expect(isFuelDate("2026-09-27", NOW, NEW_YORK)).toBe(false);
    expect(isFuelDate("2026-08-26", NOW, NEW_YORK)).toBe(false);
  });
});

describe("readLoggedAt", () => {
  it("reads an absent time as now", () => {
    expect(readLoggedAt(undefined, NOW, NEW_YORK)).toEqual({ kind: "now" });
  });

  it("accepts last night's dinner", () => {
    const dinner = "2026-09-26T00:30:00Z"; // 20:30 on the 25th in New York
    expect(readLoggedAt(dinner, NOW, NEW_YORK)).toEqual({ kind: "at", instant: new Date(dinner) });
  });

  it("refuses a time that is not a time", () => {
    expect(readLoggedAt("yesterday", NOW, NEW_YORK).kind).toBe("refused");
    expect(readLoggedAt(1_790_000_000, NOW, NEW_YORK).kind).toBe("refused");
  });

  it("refuses the future but allows a phone clock a few minutes ahead", () => {
    expect(readLoggedAt("2026-09-26T18:03:00Z", NOW, NEW_YORK).kind).toBe("at");
    expect(readLoggedAt("2026-09-26T19:00:00Z", NOW, NEW_YORK).kind).toBe("refused");
  });

  it("refuses a time before the window, judged by the user's calendar", () => {
    // 03:00 UTC on Aug 27 is 23:00 on Aug 26 in New York — one day outside.
    expect(readLoggedAt("2026-08-27T03:00:00Z", NOW, NEW_YORK).kind).toBe("refused");
    expect(readLoggedAt("2026-08-27T05:00:00Z", NOW, NEW_YORK).kind).toBe("at");
  });
});
