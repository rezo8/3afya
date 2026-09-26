import { bumpAmount, type AmountDraft, type FoodDraft } from "@/lib/fuel";

export const PROTEIN_STEP = 5;
export const CALORIE_STEP = 50;
const CARB_STEP = 5;
const FAT_STEP = 2;

/**
 * A food's name and numbers: the same fields whether it is being logged or corrected.
 * Carbs and fat show "—" while blank, because blank there means "not given", not zero.
 */
export function FoodFields({ draft, onChange }: { draft: FoodDraft; onChange: (next: FoodDraft) => void }) {
  const set = (field: keyof FoodDraft) => (value: string) => onChange({ ...draft, [field]: value });
  return (
    <>
      <input
        className="fuel-name"
        value={draft.label}
        onChange={(e) => set("label")(e.target.value)}
        placeholder="What did you eat?"
        aria-label="Food name"
      />
      <NumberField label="Protein" unit="g" value={draft.proteinG} step={PROTEIN_STEP} inputMode="decimal" onChange={set("proteinG")} />
      <NumberField label="Calories" unit="kcal" value={draft.calories} step={CALORIE_STEP} inputMode="numeric" onChange={set("calories")} />
      <NumberField
        label="Carbs"
        unit="g"
        value={draft.carbsG}
        step={CARB_STEP}
        inputMode="decimal"
        placeholder="—"
        onChange={set("carbsG")}
      />
      <NumberField label="Fat" unit="g" value={draft.fatG} step={FAT_STEP} inputMode="decimal" placeholder="—" onChange={set("fatG")} />
    </>
  );
}

export function NumberField({
  label,
  unit,
  value,
  step,
  inputMode,
  placeholder = "0",
  onChange,
}: {
  label: string;
  unit: string;
  value: AmountDraft;
  step: number;
  inputMode: "numeric" | "decimal";
  placeholder?: string;
  onChange: (next: AmountDraft) => void;
}) {
  return (
    <div className="fuel-field">
      <span className="fuel-field-label">{label}</span>
      <div className="fuel-field-ctl">
        <button type="button" className="step small" aria-label={`Less ${label}`} onClick={() => onChange(bumpAmount(value, -step))}>
          −
        </button>
        <input
          className="fuel-field-num"
          value={value}
          inputMode={inputMode}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="fuel-field-unit">{unit}</span>
        <button type="button" className="step small" aria-label={`More ${label}`} onClick={() => onChange(bumpAmount(value, step))}>
          +
        </button>
      </div>
    </div>
  );
}
