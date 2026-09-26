import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NutritionTarget, TargetPeriod } from "@afya/shared";
import { api } from "@/lib/api/client";
import { canSaveTargets, targetBody, targetDraftFrom, type TargetDraft } from "@/lib/fuel";
import { useTrackedMutation, type MutationErrorSlot } from "@/lib/query/use-mutation-error";
import { FUEL_KEY } from "./fuel-day";
import { CALORIE_STEP, NumberField, PROTEIN_STEP } from "./FoodFields";

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const describeTarget = (t: NutritionTarget) =>
  [
    `${t.calories.toLocaleString("en-US")} kcal`,
    `${t.proteinG} g protein`,
    t.carbsG !== null && `${t.carbsG} g carbs`,
    t.fatG !== null && `${t.fatG} g fat`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

/**
 * The four targets and every one the user has had. Saving appends a row — the log is never
 * rewritten — so each past day stays scored against the target it actually had.
 */
export function FuelTargets({ target, errors }: { target: NutritionTarget; errors: MutationErrorSlot }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<TargetDraft | null>(null);
  const { data: periods } = useQuery({
    queryKey: [...FUEL_KEY, "targets"],
    queryFn: () => api.get<TargetPeriod[]>("/api/fuel/targets"),
  });
  const save = useTrackedMutation(errors, {
    mutationFn: (next: NutritionTarget) => api.put<NutritionTarget>("/api/fuel/target", next),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: FUEL_KEY });
      setDraft(null);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !canSaveTargets(draft) || save.isPending) return;
    save.mutate(targetBody(draft));
  };

  const tiles: { name: string; value: string | null; kind: string }[] = [
    { name: "Calories", value: `${target.calories.toLocaleString("en-US")} kcal`, kind: "cal" },
    { name: "Protein", value: `${target.proteinG} g`, kind: "protein" },
    { name: "Carbs", value: target.carbsG === null ? null : `${target.carbsG} g`, kind: "carbs" },
    { name: "Fat", value: target.fatG === null ? null : `${target.fatG} g`, kind: "fat" },
  ];

  return (
    <section className="fuel-targets" aria-label="Targets">
      <div className="fuel-part-head">
        <p className="eyebrow">Targets</p>
        {!draft && (
          <button className="targets-edit" onClick={() => setDraft(targetDraftFrom(target))}>
            Edit targets
          </button>
        )}
      </div>

      {draft ? (
        <form className="fuel-edit" onSubmit={submit} aria-label="Edit targets">
          <NumberField
            label="Calories"
            unit="kcal"
            value={draft.calories}
            step={CALORIE_STEP}
            inputMode="numeric"
            onChange={(calories) => setDraft({ ...draft, calories })}
          />
          <NumberField
            label="Protein"
            unit="g"
            value={draft.proteinG}
            step={PROTEIN_STEP}
            inputMode="numeric"
            onChange={(proteinG) => setDraft({ ...draft, proteinG })}
          />
          <NumberField
            label="Carbs"
            unit="g"
            value={draft.carbsG}
            step={10}
            inputMode="numeric"
            placeholder="none"
            onChange={(carbsG) => setDraft({ ...draft, carbsG })}
          />
          <NumberField
            label="Fat"
            unit="g"
            value={draft.fatG}
            step={5}
            inputMode="numeric"
            placeholder="none"
            onChange={(fatG) => setDraft({ ...draft, fatG })}
          />
          <p className="food-note">Leave carbs or fat blank to track them without aiming at a number.</p>
          <div className="fuel-edit-actions">
            <button type="button" className="fuel-cancel" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" className="fuel-save" disabled={!canSaveTargets(draft) || save.isPending}>
              {save.isPending ? "…" : "Save targets"}
            </button>
          </div>
        </form>
      ) : (
        <div className="target-tiles">
          {tiles.map((tile) => (
            <div key={tile.name} className={`target-tile ${tile.kind}${tile.value === null ? " unset" : ""}`}>
              <span className="target-tile-name">{tile.name}</span>
              <b>{tile.value ?? "No target"}</b>
            </div>
          ))}
        </div>
      )}

      {periods && periods.length > 0 && (
        <div className="target-history">
          <p className="eyebrow">History</p>
          <ul>
            {periods.map((p) => (
              <li key={p.from} className={p.to === null ? "current" : ""}>
                {shortDate(p.from)} → {p.to === null ? "now" : shortDate(p.to)} · {describeTarget(p.target)}
              </li>
            ))}
          </ul>
          <p className="food-note">Each past day is scored against the target it had.</p>
        </div>
      )}
    </section>
  );
}
