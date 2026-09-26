import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ENERGY_PER_LB, type Expenditure, type NutritionTarget } from "@afya/shared";
import { api } from "@/lib/api/client";
import { useTrackedMutation, type MutationErrorSlot } from "@/lib/query/use-mutation-error";
import { FUEL_KEY } from "./fuel-day";

/** A lean gain is a small, deliberate surplus. */
const LEAN_GAIN_KCAL = 250;

const kcal = (n: number) => n.toLocaleString("en-US");
const signed = (n: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} ${unit}`;

/**
 * What the user actually burns, from what they ate and what their weight did. It proposes a
 * target and never sets one: only a tap on a button appends a new target, and every older
 * target stays on record.
 */
export function FuelExpenditure({ target, errors }: { target: NutritionTarget; errors: MutationErrorSlot }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: [...FUEL_KEY, "expenditure"],
    queryFn: () => api.get<Expenditure>("/api/fuel/expenditure"),
  });
  const adopt = useTrackedMutation(errors, {
    mutationFn: (calories: number) => api.put<NutritionTarget>("/api/fuel/target", { ...target, calories }),
    onSuccess: () => qc.invalidateQueries({ queryKey: FUEL_KEY }),
  });
  if (!data) return null;

  if (data.state === "insufficient") {
    return (
      <section className="expenditure" aria-label="Estimated expenditure">
        <p className="eyebrow">Estimated expenditure</p>
        <p className="expenditure-lead">Not enough to go on yet.</p>
        <p className="food-note">
          It's worked out from what you eat and what your weight does over {data.windowDays} days, not from a formula.
        </p>
        <ul className="expenditure-needs">
          {data.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>
    );
  }

  const gap = target.calories - data.kcalPerDay;
  const impliedLbPerWeek = Math.round(((gap * 7) / ENERGY_PER_LB) * 10) / 10;
  const maintain = data.kcalPerDay;
  const leanGain = data.kcalPerDay + LEAN_GAIN_KCAL;
  const unlogged = data.windowDays - data.loggedDays;

  return (
    <section className="expenditure" aria-label="Estimated expenditure">
      <p className="eyebrow">Estimated expenditure</p>
      <p className="fuel-week-big">
        ~{kcal(data.kcalPerDay)}
        <span> kcal/day</span>
      </p>
      <p className="food-note">
        From {data.loggedDays} days of intake (avg {kcal(data.intakePerDay)}) and your weight trend (
        {signed(data.trendLbPerWeek, "lb/week")}). Confidence: {data.confidence}
        {unlogged > 0 && `, ${unlogged} ${unlogged === 1 ? "day" : "days"} unlogged`}.
      </p>
      <p className="expenditure-lead">
        {gap === 0 ? (
          "Your target matches it."
        ) : (
          <>
            Your target is <b>{kcal(Math.abs(gap))} {gap > 0 ? "over" : "under"}</b> it — about{" "}
            {signed(impliedLbPerWeek, "lb")} a week if you hit it every day.
          </>
        )}
      </p>
      <div className="expenditure-actions">
        <button disabled={adopt.isPending || target.calories === maintain} onClick={() => adopt.mutate(maintain)}>
          Maintain · {kcal(maintain)}
        </button>
        <button
          className="lean"
          disabled={adopt.isPending || target.calories === leanGain}
          onClick={() => adopt.mutate(leanGain)}
        >
          Lean gain · {kcal(leanGain)}
        </button>
      </div>
      <p className="food-note">Your target only changes if you tap one. Protein, carbs and fat stay as they are.</p>
    </section>
  );
}
