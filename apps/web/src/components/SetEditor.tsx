import type { DistanceUnit, ExerciseKind, SetLog, UpdateSetBody } from "@afya/shared";
import { DraftInput } from "@/components/DraftInput";
import { fmtClock, fmtDist, parseDuration } from "@/lib/format";

const DISTANCE_STEP: Record<DistanceUnit, number> = { mi: 0.5, km: 0.5, m: 50 };

export const stepDistance = (distance: number, unit: DistanceUnit, direction: 1 | -1) =>
  Math.max(0, Math.round((distance + direction * DISTANCE_STEP[unit]) * 100) / 100);

type StepProps = {
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  children: React.ReactNode;
};

/** − value + at logged-set size, for correcting a set after the fact. */
function EditStep({ decreaseLabel, increaseLabel, onDecrease, onIncrease, children }: StepProps) {
  return (
    <>
      <button aria-label={decreaseLabel} onClick={onDecrease}>
        −
      </button>
      {children}
      <button aria-label={increaseLabel} onClick={onIncrease}>
        +
      </button>
    </>
  );
}

/**
 * Correct one logged set, in whatever terms its exercise is measured. Used live during a
 * session and again in history, so a set is edited the same way however you reach it.
 */
export function SetEditor({
  kind,
  set,
  onPatch,
}: {
  kind: ExerciseKind;
  set: SetLog;
  onPatch: (patch: UpdateSetBody) => void;
}) {
  const unit = set.distanceUnit ?? "mi";
  return (
    <div className="ls-edit">
      {kind === "weighted" ? (
        <>
          <EditStep
            decreaseLabel="Less weight"
            increaseLabel="More weight"
            onDecrease={() => onPatch({ weight: Math.max(0, set.weight - 5) })}
            onIncrease={() => onPatch({ weight: set.weight + 5 })}
          >
            <b>{set.weight}</b>
            <span className="u">lb</span>
          </EditStep>
          <span className="x">×</span>
          <EditStep
            decreaseLabel="Fewer reps"
            increaseLabel="More reps"
            onDecrease={() => onPatch({ reps: Math.max(1, set.reps - 1) })}
            onIncrease={() => onPatch({ reps: set.reps + 1 })}
          >
            <b>{set.reps}</b>
          </EditStep>
        </>
      ) : kind === "reps" ? (
        <EditStep
          decreaseLabel="Fewer reps"
          increaseLabel="More reps"
          onDecrease={() => onPatch({ reps: Math.max(1, set.reps - 1) })}
          onIncrease={() => onPatch({ reps: set.reps + 1 })}
        >
          <b>{set.reps}</b>
          <span className="u">reps</span>
        </EditStep>
      ) : kind === "distance" ? (
        <>
          <EditStep
            decreaseLabel="Shorter distance"
            increaseLabel="Longer distance"
            onDecrease={() => onPatch({ distance: stepDistance(set.distance, unit, -1) })}
            onIncrease={() => onPatch({ distance: stepDistance(set.distance, unit, 1) })}
          >
            <b>{fmtDist(set.distance, unit)}</b>
          </EditStep>
          <DraftInput
            key={set.id}
            className="ls-time-in"
            ariaLabel="Time"
            value={set.durationSec}
            format={fmtClock}
            parse={parseDuration}
            onChange={(durationSec) => onPatch({ durationSec })}
          />
        </>
      ) : (
        <DraftInput
          key={set.id}
          className="ls-time-in"
          ariaLabel="Time"
          value={set.durationSec}
          format={fmtClock}
          parse={parseDuration}
          onChange={(durationSec) => onPatch({ durationSec })}
        />
      )}
      <button
        className={`ls-warmup-btn${set.isWarmup ? " on" : ""}`}
        aria-label={set.isWarmup ? "Mark as working set" : "Mark as warm-up"}
        aria-pressed={set.isWarmup}
        onClick={() => onPatch({ isWarmup: !set.isWarmup })}
      >
        W
      </button>
    </div>
  );
}
