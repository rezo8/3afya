import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { NutritionTarget } from "@afya/shared";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api } from "@/lib/api/client";
import { amountValue, canLogFood, EMPTY_FOOD_DRAFT, foodBody, isUsableTarget, type AmountDraft, type FoodDraft } from "@/lib/fuel";
import { loggedAtFor, type LocalDate } from "@/lib/fuel-date";
import { useMutationError, useTrackedMutation } from "@/lib/query/use-mutation-error";
import { FUEL_KEY, quickAddsFor, useFuelDay, useLogFuel } from "./fuel-day";
import { FuelLog } from "./FuelLog";
import { CarbsAndFat, FuelMeters } from "./FuelMeters";
import { CALORIE_STEP, FoodFields, NumberField, PROTEIN_STEP } from "./FoodFields";
import { QuickAdd } from "./QuickAdd";

type TargetDraft = { proteinG: AmountDraft; calories: AmountDraft };

/** One day's fuel. Anything logged here lands on `date`; `isToday` only changes what the page calls it. */
export function FuelPanel({ date, isToday }: { date: LocalDate; isToday: boolean }) {
  const qc = useQueryClient();
  const { data } = useFuelDay(date);
  const errors = useMutationError();
  const [showCustom, setShowCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState<FoodDraft>(EMPTY_FOOD_DRAFT);
  const [targetDraft, setTargetDraft] = useState<TargetDraft | null>(null);

  const invalidateFuel = () => qc.invalidateQueries({ queryKey: FUEL_KEY });
  const add = useLogFuel(errors);
  const saveTarget = useTrackedMutation(errors, {
    mutationFn: (target: NutritionTarget) => api.put<NutritionTarget>("/api/fuel/target", target),
    onSuccess: () => {
      setTargetDraft(null);
      invalidateFuel();
    },
  });

  if (!data) return null;
  const { target } = data;

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

      <FuelLog entries={data.entries} date={date} isToday={isToday} errors={errors} />
    </section>
  );
}
