import type { DistanceUnit } from "@afya/shared";

const METRES_PER_UNIT: Record<DistanceUnit, number> = {
  mi: 1609.344,
  km: 1000,
  m: 1,
};

const UNITS = Object.keys(METRES_PER_UNIT) as DistanceUnit[];

/** The caller's unit if they sent a valid one, else null. */
export const parseDistanceUnit = (value: unknown): DistanceUnit | null =>
  typeof value === "string" ? (UNITS.find((unit) => unit === value) ?? null) : null;

/**
 * A distance in metres, so sets entered in different units still compare. A set with
 * no unit records no distance, and scores zero rather than being read as metres.
 */
export const toMetres = (distance: number, unit: DistanceUnit | null): number =>
  unit && distance > 0 ? distance * METRES_PER_UNIT[unit] : 0;

export const fromMetres = (metres: number, unit: DistanceUnit): number => metres / METRES_PER_UNIT[unit];
