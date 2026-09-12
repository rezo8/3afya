import { setLog } from "./schema/tracker";

/**
 * The set columns a `RecordSet` is made of. Every query feeding `computeRecords` or
 * `detectPrs` selects exactly these — omitting one (warm-up flags, distance units)
 * doesn't fail, it silently scores the wrong records.
 */
export const recordSetColumns = {
  id: setLog.id,
  weight: setLog.weight,
  reps: setLog.reps,
  durationSec: setLog.durationSec,
  distance: setLog.distance,
  distanceUnit: setLog.distanceUnit,
  isWarmup: setLog.isWarmup,
  completedAt: setLog.completedAt,
};
