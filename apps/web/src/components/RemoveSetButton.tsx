/**
 * The × that removes a logged set, guarded the way delete-day and remove-exercise are: the
 * first tap arms it and spells out what a second tap does. Used live in a session and again
 * in history, so a set is removed the same way however you reach it. Both faces go quiet
 * while a removal is in flight: the arm window can expire mid-request, and a live × on the
 * row being removed would let a second tap delete a set that is already gone.
 */
export function RemoveSetButton({
  armed,
  disabled,
  onArm,
  onConfirm,
}: {
  armed: boolean;
  disabled: boolean;
  onArm: () => void;
  onConfirm: () => void;
}) {
  if (armed) {
    return (
      <button className="ls-del armed" aria-live="polite" disabled={disabled} onClick={onConfirm}>
        Remove?
      </button>
    );
  }
  return (
    <button className="ls-del" aria-label="Remove set" aria-live="polite" disabled={disabled} onClick={onArm}>
      ×
    </button>
  );
}
