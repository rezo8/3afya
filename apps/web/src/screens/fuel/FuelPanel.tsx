import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FuelEntry, FuelItem, NutritionTarget, UpdateFuelEntryBody } from "@afya/shared";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api } from "@/lib/api/client";
import {
  amountValue,
  canLogFood,
  EMPTY_FOOD_DRAFT,
  foodBody,
  foodDraftFrom,
  fuelMacroSummary,
  isUsableTarget,
  servingOf,
  type AmountDraft,
  type FoodDraft,
} from "@/lib/fuel";
import { useMutationError, useTrackedMutation } from "@/lib/query/use-mutation-error";
import { CarbsAndFat, FuelMeters } from "./FuelMeters";
import { CALORIE_STEP, FoodFields, NumberField, PROTEIN_STEP } from "./FoodFields";
import { QuickAdd } from "./QuickAdd";
import {
  earliestFuelDate,
  fromDateTimeLocal,
  localDateOf,
  loggedAtFor,
  toDateTimeLocal,
  type LocalDate,
} from "@/lib/fuel-date";
import { FUEL_KEY, quickAddsFor, useFuelDay, useLogFuel } from "./fuel-day";

const COLLAPSED_ENTRIES = 3;

type TargetDraft = { proteinG: AmountDraft; calories: AmountDraft };
/** An entry being corrected: its food, and when it was eaten as the `datetime-local` input holds it. */
type EntryDraft = FoodDraft & { id: string; when: string };

/** The unit a logged entry is saved under until the user names a better one. */
const SAVED_ENTRY_UNIT = "1 serving";

const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** One day's fuel. Anything logged here lands on `date`; `isToday` only changes what the page calls it. */
export function FuelPanel({ date, isToday }: { date: LocalDate; isToday: boolean }) {
  const qc = useQueryClient();
  const { data } = useFuelDay(date);
  const errors = useMutationError();
  const [showCustom, setShowCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState<FoodDraft>(EMPTY_FOOD_DRAFT);
  const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);

  const invalidateFuel = () => qc.invalidateQueries({ queryKey: FUEL_KEY });
  const add = useLogFuel(errors);
  const remove = useTrackedMutation(errors, {
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/fuel/${id}`),
    onSuccess: (_, id) => {
      setEntryDraft((draft) => (draft?.id === id ? null : draft));
      invalidateFuel();
    },
  });
  const update = useTrackedMutation(errors, {
    mutationFn: ({ id, ...body }: UpdateFuelEntryBody & { id: string }) => api.patch<FuelEntry>(`/api/fuel/${id}`, body),
    // Returning the refetch keeps `isPending` true until fresh totals are in, so closing
    // the form never reveals the row's old numbers for a round trip after "Save".
    onSuccess: async () => {
      await invalidateFuel();
      setEntryDraft(null);
    },
  });
  // Saves one serving under the entry's name, in a unit the user can rename on the Foods screen.
  const saveAsFood = useTrackedMutation(errors, {
    mutationFn: (entry: FuelEntry) =>
      api.post<FuelItem>("/api/fuel/items", { label: entry.label, unit: SAVED_ENTRY_UNIT, ...servingOf(entry) }),
    onSuccess: invalidateFuel,
  });
  const saveTarget = useTrackedMutation(errors, {
    mutationFn: (target: NutritionTarget) => api.put<NutritionTarget>("/api/fuel/target", target),
    onSuccess: () => {
      setTargetDraft(null);
      invalidateFuel();
    },
  });

  if (!data) return null;
  const { target, entries } = data;

  const newestFirst = [...entries].reverse();
  const visibleEntries = showAllEntries ? newestFirst : newestFirst.slice(0, COLLAPSED_ENTRIES);
  const hiddenEntries = newestFirst.length - COLLAPSED_ENTRIES;

  const canAddCustom = canLogFood(customDraft);
  const submitCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!canAddCustom || add.isPending) return;
    add.mutate({ ...foodBody(customDraft), loggedAt: loggedAtFor(date, new Date()) });
    setCustomDraft(EMPTY_FOOD_DRAFT);
    setShowCustom(false);
  };

  const canSaveTarget = !!targetDraft && isUsableTarget(targetDraft.proteinG) && isUsableTarget(targetDraft.calories);
  const submitTarget = (e: FormEvent) => {
    e.preventDefault();
    if (!targetDraft || !canSaveTarget || saveTarget.isPending) return;
    // Carbs and fat targets are carried through untouched: this form does not edit them (T-054).
    saveTarget.mutate({
      proteinG: amountValue(targetDraft.proteinG),
      calories: amountValue(targetDraft.calories),
      carbsG: target.carbsG,
      fatG: target.fatG,
    });
  };
  const entryLoggedAt = entryDraft ? fromDateTimeLocal(entryDraft.when) : null;
  const canSaveEntry = !!entryDraft && canLogFood(entryDraft) && entryLoggedAt !== null;
  const submitEntry = (e: FormEvent) => {
    e.preventDefault();
    if (!entryDraft || !entryLoggedAt || !canSaveEntry || update.isPending) return;
    update.mutate({ id: entryDraft.id, ...foodBody(entryDraft), loggedAt: entryLoggedAt });
  };
  const openEntryEdit = (entry: FuelEntry) =>
    setEntryDraft({ id: entry.id, ...foodDraftFrom(entry), when: toDateTimeLocal(entry.loggedAt) });

  const toggleTargetEdit = () =>
    setTargetDraft((draft) =>
      draft ? null : { proteinG: String(target.proteinG), calories: String(target.calories) },
    );

  return (
    <section className="eating">
      <div className="eating-head">
        <p className="eyebrow">Totals</p>
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

      <FuelMeters day={data} />
      <CarbsAndFat day={data} />

      <QuickAdd foods={quickAddsFor(data)} date={date} errors={errors} />
      <Link to="/fuel/foods" className="fuel-foods-link">
        Your foods ›
      </Link>

      {showCustom ? (
        <form className="fuel-custom" onSubmit={submitCustom}>
          <div className="fuel-custom-head">
            <p className="eyebrow">Log something else</p>
            <button type="button" className="fuel-cancel" onClick={() => setShowCustom(false)}>
              Close
            </button>
          </div>
          <FoodFields draft={customDraft} onChange={setCustomDraft} />
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
          <p className="eyebrow">{isToday ? "Logged today" : "Logged"}</p>
          <ul>
            {visibleEntries.map((entry) =>
              entryDraft?.id === entry.id ? (
                <li key={entry.id}>
                  <form className="fuel-edit" onSubmit={submitEntry} aria-label={`Edit ${entry.label}`}>
                    <FoodFields draft={entryDraft} onChange={(food) => setEntryDraft({ ...entryDraft, ...food })} />
                    <label className="fuel-when">
                      <span className="fuel-field-label">Eaten</span>
                      <input
                        type="datetime-local"
                        min={`${earliestFuelDate(localDateOf(new Date()))}T00:00`}
                        max={toDateTimeLocal(new Date().toISOString())}
                        value={entryDraft.when}
                        onChange={(e) => setEntryDraft({ ...entryDraft, when: e.target.value })}
                      />
                    </label>
                    <div className="fuel-edit-actions">
                      {entry.itemId === null && (
                        <button
                          type="button"
                          className="fuel-cancel"
                          disabled={saveAsFood.isPending}
                          onClick={() => saveAsFood.mutate(entry)}
                        >
                          {saveAsFood.isPending ? "…" : "Save as food"}
                        </button>
                      )}
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
                      {timeOfDay(entry.loggedAt)} · {entry.portion !== null && entry.portion !== 1 && `×${entry.portion} · `}
                      {fuelMacroSummary(entry)}
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
