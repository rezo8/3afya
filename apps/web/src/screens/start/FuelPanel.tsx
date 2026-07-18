import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddFuelEntryBody, FuelDay } from "@afya/shared";
import { api } from "@/lib/api/client";

const CHIPS: AddFuelEntryBody[] = [
  { label: "Chicken breast", proteinG: 30, calories: 200 },
  { label: "Protein shake", proteinG: 24, calories: 150 },
  { label: "Greek yogurt", proteinG: 12, calories: 90 },
  { label: "Rice bowl", proteinG: 8, calories: 320 },
];

export function FuelPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["fuel", "today"], queryFn: () => api.get<FuelDay>("/api/fuel/today") });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fuel", "today"] });
  const add = useMutation({ mutationFn: (b: AddFuelEntryBody) => api.post("/api/fuel", b), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/fuel/${id}`), onSuccess: invalidate });

  if (!data) return null;
  const { target, totals, entries } = data;
  const pPct = Math.min(100, (totals.proteinG / target.proteinG) * 100);
  const cPct = Math.min(100, (totals.calories / target.calories) * 100);
  const over = totals.calories > target.calories;

  return (
    <section className="eating">
      <div className="eating-head">
        <p className="eyebrow">Fuel</p>
        <span className="kcap">targets · today</span>
      </div>
      <div className="meters">
        <div className="meter">
          <div className="mtop">
            <span className="mname">Protein</span>
            <span className="mval">
              <b>{Math.round(totals.proteinG)}</b> / <span className="goal">{target.proteinG} g</span>
            </span>
          </div>
          <div className="bar protein">
            <i style={{ width: `${pPct}%` }} />
          </div>
        </div>
        <div className="meter">
          <div className="mtop">
            <span className="mname">Calories</span>
            <span className="mval">
              <b>{Math.round(totals.calories)}</b> / <span className="goal">{target.calories} kcal</span>
            </span>
          </div>
          <div className={`bar cal${over ? " over" : ""}`}>
            <i style={{ width: `${cPct}%` }} />
          </div>
        </div>
      </div>

      <div className="quickadd">
        {CHIPS.map((chip) => (
          <button key={chip.label} className="chip" onClick={() => add.mutate(chip)} disabled={add.isPending}>
            + {chip.label} {chip.proteinG}p
          </button>
        ))}
      </div>

      {entries.length > 0 && (
        <div className="quickadd" style={{ marginTop: 10 }}>
          {entries.map((e) => (
            <button
              key={e.id}
              className="chip"
              title="Remove"
              onClick={() => remove.mutate(e.id)}
              style={{ borderStyle: "dashed" }}
            >
              {e.label} · {Math.round(e.proteinG)}p · {e.calories}c ✕
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
