import type { FrequentFuel, FuelDay } from "@afya/shared";
import { fuelMacroSummary } from "@/lib/fuel";

const pct = (done: number, goal: number) => (goal > 0 ? Math.min(100, (done / goal) * 100) : 0);

/** Protein and calories against today's target, with what is left of each. */
export function FuelMeters({ day }: { day: FuelDay }) {
  const { target, totals } = day;
  const proteinDone = Math.round(totals.proteinG);
  const caloriesDone = Math.round(totals.calories);
  const proteinLeft = target.proteinG - proteinDone;
  const caloriesLeft = target.calories - caloriesDone;
  const proteinNote = proteinLeft > 0 ? `${proteinLeft} g to go` : proteinLeft < 0 ? `hit · +${-proteinLeft} g` : "hit";
  const calorieNote = caloriesLeft > 0 ? `${caloriesLeft} kcal left` : caloriesLeft < 0 ? `over by ${-caloriesLeft}` : "hit";

  return (
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
  );
}

/** One tap logs one serving. Each chip states what it adds, so a tap never moves a total unseen (ISS-010). */
export function QuickAddChips({
  foods,
  onAdd,
  disabled,
}: {
  foods: FrequentFuel[];
  onAdd: (food: FrequentFuel) => void;
  disabled: boolean;
}) {
  return (
    <div className="quickadd">
      {foods.map((food) => (
        <button key={food.label} className="chip" onClick={() => onAdd(food)} disabled={disabled}>
          + {food.label} {fuelMacroSummary(food.proteinG, food.calories)}
        </button>
      ))}
    </div>
  );
}
