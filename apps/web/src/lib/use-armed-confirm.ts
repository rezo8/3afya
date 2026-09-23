import { useEffect, useState } from "react";

/**
 * How long an armed confirm — "Delete day", "Remove set" — stays armed after the first
 * tap. Long enough to read the stakes it reveals and tap again; a shorter window expires
 * mid-sentence and reads as a broken control rather than a guard.
 */
export const DELETE_ARM_MS = 4000;

type ArmedConfirm<Target> = {
  armed: Target | null;
  arm: (target: Target) => void;
  disarm: () => void;
};

/**
 * Two-tap confirm for a destructive control: the first tap arms one target and the second
 * within the window fires. Arming another target replaces the first, so only one thing at
 * a time is about to be destroyed, and an armed control that is left alone disarms itself.
 */
export function useArmedConfirm<Target>(): ArmedConfirm<Target> {
  const [armed, setArmed] = useState<Target | null>(null);
  useEffect(() => {
    if (armed === null) return;
    const t = setTimeout(() => setArmed(null), DELETE_ARM_MS);
    return () => clearTimeout(t);
  }, [armed]);
  return { armed, arm: setArmed, disarm: () => setArmed(null) };
}
