import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddFuelEntryBody, FuelDay, FuelEntry, NutritionTarget, UpdateFuelEntryBody } from "@afya/shared";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api } from "@/lib/api/client";
import { amountValue, bumpAmount, canLogAmounts, fuelMacroSummary, isUsableTarget, readAmount, type AmountDraft } from "@/lib/fuel";
import { useMutationError, useTrackedMutation } from "@/lib/query/use-mutation-error";

const COLD_START_CHIPS: AddFuelEntryBody[] = [
  { label: "Chicken breast", proteinG: 30, calories: 200 },
  { label: "Protein shake", proteinG: 24, calories: 150 },
  { label: "Greek yogurt", proteinG: 12, calories: 90 },
  { label: "Rice bowl", proteinG: 8, calories: 320 },
];

const PROTEIN_STEP = 5;
const CALORIE_STEP = 50;
const COLLAPSED_ENTRIES = 3;

type TargetDraft = { proteinG: AmountDraft; calories: AmountDraft };
type EntryDraft = { id: string; label: string; proteinG: AmountDraft; calories: AmountDraft };

/** A zero was a blank when it was logged (a food may declare one number), so it reopens blank. */
const draftAmount = (value: number): AmountDraft => (value > 0 ? String(value) : "");

const pct = (done: number, goal: number) => (goal > 0 ? Math.min(100, (done / goal) * 100) : 0);
const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function FuelPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["fuel", "today"], queryFn: () => api.get<FuelDay>("/api/fuel/today") });
  const errors = useMutationError();
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customProtein, setCustomProtein] = useState<AmountDraft>("");
  const [customCalories, setCustomCalories] = useState<AmountDraft>("");
  const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);

  const invalidateToday = () => qc.invalidateQueries({ queryKey: ["fuel", "today"] });
  const add = useTrackedMutation(errors, {
    mutationFn: (body: AddFuelEntryBody) => api.post<FuelEntry>("/api/fuel", body),
    onSuccess: () => invalidateToday(),
  });
  const remove = useTrackedMutation(errors, {
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/fuel/${id}`),
    onSuccess: (_, id) => {
      setEntryDraft((draft) => (draft?.id === id ? null : draft));
      invalidateToday();
    },
  });
  const update = useTrackedMutation(errors, {
    mutationFn: ({ id, ...body }: UpdateFuelEntryBody & { id: string }) => api.patch<FuelEntry>(`/api/fuel/${id}`, body),
    // Returning the refetch keeps `isPending` true until fresh totals are in, so closing
    // the form never reveals the row's old numbers for a round trip after "Save".
    onSuccess: async () => {
      await Promise.all([
        invalidateToday(),
        // A corrected entry changes a past day's total too, which Trends scores.
        qc.invalidateQueries({ queryKey: ["fuel", "history"] }),
      ]);
      setEntryDraft(null);
    },
  });
  const saveTarget = useTrackedMutation(errors, {
    mutationFn: (target: NutritionTarget) => api.put<NutritionTarget>("/api/fuel/target", target),
    onSuccess: () => {
      setTargetDraft(null);
      invalidateToday();
      qc.invalidateQueries({ queryKey: ["fuel", "history"] });
    },
  });

  if (!data) return null;
  const { target, totals, entries } = data;

  const proteinDone = Math.round(totals.proteinG);
  const caloriesDone = Math.round(totals.calories);
  const proteinLeft = target.proteinG - proteinDone;
  const caloriesLeft = target.calories - caloriesDone;
  const proteinNote = proteinLeft > 0 ? `${proteinLeft} g to go` : proteinLeft < 0 ? `hit · +${-proteinLeft} g` : "hit";
  const calorieNote = caloriesLeft > 0 ? `${caloriesLeft} kcal left` : caloriesLeft < 0 ? `over by ${-caloriesLeft}` : "hit";

  const quickAdds = data.frequent.length > 0 ? data.frequent : COLD_START_CHIPS;
  const newestFirst = [...entries].reverse();
  const visibleEntries = showAllEntries ? newestFirst : newestFirst.slice(0, COLLAPSED_ENTRIES);
  const hiddenEntries = newestFirst.length - COLLAPSED_ENTRIES;

  const canAddCustom =
    customLabel.trim() !== "" && canLogAmounts(readAmount(customProtein), readAmount(customCalories));
  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!canAddCustom || add.isPending) return;
    add.mutate({ label: customLabel.trim(), proteinG: amountValue(customProtein), calories: amountValue(customCalories) });
    setCustomLabel("");
    setCustomProtein("");
    setCustomCalories("");
    setShowCustom(false);
  };

  const canSaveTarget = !!targetDraft && isUsableTarget(targetDraft.proteinG) && isUsableTarget(targetDraft.calories);
  const submitTarget = (e: FormEvent) => {
    e.preventDefault();
    if (!targetDraft || !canSaveTarget || saveTarget.isPending) return;
    saveTarget.mutate({ proteinG: amountValue(targetDraft.proteinG), calories: amountValue(targetDraft.calories) });
  };
  const canSaveEntry =
    !!entryDraft &&
    entryDraft.label.trim() !== "" &&
    canLogAmounts(readAmount(entryDraft.proteinG), readAmount(entryDraft.calories));
  const submitEntry = (e: FormEvent) => {
    e.preventDefault();
    if (!entryDraft || !canSaveEntry || update.isPending) return;
    update.mutate({
      id: entryDraft.id,
      label: entryDraft.label.trim(),
      proteinG: amountValue(entryDraft.proteinG),
      calories: amountValue(entryDraft.calories),
    });
  };
  const openEntryEdit = (entry: FuelEntry) =>
    setEntryDraft({
      id: entry.id,
      label: entry.label,
      proteinG: draftAmount(entry.proteinG),
      calories: draftAmount(entry.calories),
    });

  const toggleTargetEdit = () =>
    setTargetDraft((draft) =>
      draft ? null : { proteinG: String(target.proteinG), calories: String(target.calories) },
    );

  return (
    <section className="eating">
      <div className="eating-head">
        <p className="eyebrow">Fuel</p>
        <button className="kcap fuel-target-open" aria-expanded={!!targetDraft} onClick={toggleTargetEdit}>
          targets · today
        </button>
      </div>

      {errors.failure && <ErrorBanner message={errors.failure.message} onRetry={errors.failure.retry} />}

      {targetDraft && (
        <form className="fuel-edit" onSubmit={submitTarget}>
          <NumberField
            label="Protein target"
            unit="g"
            value={targetDraft.proteinG}
            step={PROTEIN_STEP}
            inputMode="numeric"
            onChange={(proteinG) => setTargetDraft({ ...targetDraft, proteinG })}
          />
          <NumberField
            label="Calorie target"
            unit="kcal"
            value={targetDraft.calories}
            step={CALORIE_STEP}
            inputMode="numeric"
            onChange={(calories) => setTargetDraft({ ...targetDraft, calories })}
          />
          <div className="fuel-edit-actions">
            <button type="button" className="fuel-cancel" onClick={() => setTargetDraft(null)}>
              Cancel
            </button>
            <button type="submit" className="fuel-save" disabled={!canSaveTarget || saveTarget.isPending}>
              {saveTarget.isPending ? "…" : "Save targets"}
            </button>
          </div>
        </form>
      )}

      <div className="meters">
        <div className="meter">
          <div className="mtop">
            <span className="mname">Protein</span>
            <span className="mval">
              <b>{proteinDone}</b> / <span className="goal">{target.proteinG} g</span>
            </span>
          </div>
          <div className="bar protein">
            <i style={{ width: `${pct(proteinDone, target.proteinG)}%` }} />
          </div>
          <p className="mnote">{proteinNote}</p>
        </div>
        <div className="meter">
          <div className="mtop">
            <span className="mname">Calories</span>
            <span className="mval">
              <b>{caloriesDone}</b> / <span className="goal">{target.calories} kcal</span>
            </span>
          </div>
          <div className={`bar cal${caloriesLeft < 0 ? " over" : ""}`}>
            <i style={{ width: `${pct(caloriesDone, target.calories)}%` }} />
          </div>
          <p className="mnote">{calorieNote}</p>
        </div>
      </div>

      <div className="quickadd">
        {quickAdds.map((food) => (
          <button key={food.label} className="chip" onClick={() => add.mutate(food)} disabled={add.isPending}>
            + {food.label} {fuelMacroSummary(food.proteinG, food.calories)}
          </button>
        ))}
      </div>

      {showCustom ? (
        <form className="fuel-custom" onSubmit={submitCustom}>
          <div className="fuel-custom-head">
            <p className="eyebrow">Log something else</p>
            <button type="button" className="fuel-cancel" onClick={() => setShowCustom(false)}>
              Close
            </button>
          </div>
          <FoodFields
            label={customLabel}
            proteinG={customProtein}
            calories={customCalories}
            onLabel={setCustomLabel}
            onProtein={setCustomProtein}
            onCalories={setCustomCalories}
          />
          <button type="submit" className="fuel-save" disabled={!canAddCustom || add.isPending}>
            {add.isPending ? "…" : "Add"}
          </button>
        </form>
      ) : (
        <button className="fuel-custom-open" onClick={() => setShowCustom(true)}>
          ＋ Log something else
        </button>
      )}

      {newestFirst.length > 0 && (
        <div className="fuel-log">
          <p className="eyebrow">Logged today</p>
          <ul>
            {visibleEntries.map((entry) =>
              entryDraft?.id === entry.id ? (
                <li key={entry.id}>
                  <form className="fuel-edit" onSubmit={submitEntry} aria-label={`Edit ${entry.label}`}>
                    <FoodFields
                      label={entryDraft.label}
                      proteinG={entryDraft.proteinG}
                      calories={entryDraft.calories}
                      onLabel={(label) => setEntryDraft({ ...entryDraft, label })}
                      onProtein={(proteinG) => setEntryDraft({ ...entryDraft, proteinG })}
                      onCalories={(calories) => setEntryDraft({ ...entryDraft, calories })}
                    />
                    <div className="fuel-edit-actions">
                      <button type="button" className="fuel-cancel" onClick={() => setEntryDraft(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="fuel-save" disabled={!canSaveEntry || update.isPending}>
                        {update.isPending ? "…" : "Save"}
                      </button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={entry.id} className="fuel-row">
                  <button className="fr-open" aria-label={`Edit ${entry.label}`} onClick={() => openEntryEdit(entry)}>
                    <span className="fr-label">{entry.label}</span>
                    <span className="fr-meta">
                      {timeOfDay(entry.loggedAt)} · {fuelMacroSummary(entry.proteinG, entry.calories)}
                    </span>
                  </button>
                  <button
                    className="fr-del"
                    aria-label={`Remove ${entry.label}`}
                    onClick={() => remove.mutate(entry.id)}
                    disabled={remove.isPending}
                  >
                    ✕
                  </button>
                </li>
              ),
            )}
          </ul>
          {hiddenEntries > 0 && (
            <button className="fuel-more" aria-expanded={showAllEntries} onClick={() => setShowAllEntries((v) => !v)}>
              {showAllEntries ? "Show less" : `+${hiddenEntries} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A food's name and numbers: the same three fields whether it is being logged or corrected. */
function FoodFields({
  label,
  proteinG,
  calories,
  onLabel,
  onProtein,
  onCalories,
}: {
  label: string;
  proteinG: AmountDraft;
  calories: AmountDraft;
  onLabel: (next: string) => void;
  onProtein: (next: AmountDraft) => void;
  onCalories: (next: AmountDraft) => void;
}) {
  return (
    <>
      <input
        className="fuel-name"
        value={label}
        onChange={(e) => onLabel(e.target.value)}
        placeholder="What did you eat?"
        aria-label="Food name"
      />
      <NumberField label="Protein" unit="g" value={proteinG} step={PROTEIN_STEP} inputMode="decimal" onChange={onProtein} />
      <NumberField label="Calories" unit="kcal" value={calories} step={CALORIE_STEP} inputMode="numeric" onChange={onCalories} />
    </>
  );
}

function NumberField({
  label,
  unit,
  value,
  step,
  inputMode,
  onChange,
}: {
  label: string;
  unit: string;
  value: AmountDraft;
  step: number;
  inputMode: "numeric" | "decimal";
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
          placeholder="0"
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
