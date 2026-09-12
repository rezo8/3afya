import type { DistanceUnit } from "@afya/shared";

/** A duration as a clock: "0:45", "12:30", "1:05:30". Hours appear once there are any. */
export const fmtClock = (s: number) => {
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

/** The same duration for reading rather than editing: short holds stay "45s". */
export const fmtDur = (s: number) => (s < 60 ? `${s}s` : fmtClock(s));

/** A distance in the unit it was entered in — never converted for display. */
export const fmtDist = (distance: number, unit: DistanceUnit) => `${Math.round(distance * 100) / 100} ${unit}`;

/**
 * Seconds from what the user typed: "45" and "45s" are seconds, "12:30" is minutes and
 * seconds, "1:05:00" is hours too. Null for anything that isn't yet a duration, so a
 * half-typed "12:" leaves the value alone.
 */
export const parseDuration = (text: string): number | null => {
  const trimmed = text.trim().replace(/s$/i, "");
  if (trimmed === "") return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total;
};

/** Nudge a duration by a step that suits its size: seconds for holds, minutes for sessions. */
export const stepDuration = (durationSec: number, direction: 1 | -1) => {
  const step = durationSec >= 300 ? 60 : 5;
  return Math.max(0, durationSec + direction * step);
};
