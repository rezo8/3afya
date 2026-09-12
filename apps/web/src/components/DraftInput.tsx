import { useState } from "react";

/**
 * A number typed as text. The draft holds the keystrokes so half-finished input ("7.",
 * "12:") doesn't collapse to a number mid-entry; the value changes only once it parses.
 * Remount it (a `key` on the thing being edited) to abandon a draft.
 */
export function DraftInput({
  value,
  format,
  parse,
  onChange,
  ariaLabel,
  className,
}: {
  value: number;
  format: (value: number) => string;
  parse: (text: string) => number | null;
  onChange: (value: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className={className}
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft ?? format(value)}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = parse(e.target.value);
        if (parsed !== null) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
