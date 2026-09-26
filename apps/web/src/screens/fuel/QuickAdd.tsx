import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FuelEntry, QuickAddFood, UpdateFuelEntryBody } from "@afya/shared";
import { api } from "@/lib/api/client";
import { fuelMacroSummary, PORTIONS, scaleFood, type Portion } from "@/lib/fuel";
import { loggedAtFor, type LocalDate } from "@/lib/fuel-date";
import { useTrackedMutation, type MutationErrorSlot } from "@/lib/query/use-mutation-error";
import { FUEL_KEY, quickAddBody, useLogFuel } from "./fuel-day";

/** How long the portion row stays up after a quick-add, restarted by every correction. */
const PORTION_ROW_MS = 6000;

/** The entry a quick-add just made, and the food it was made from, so a correction scales the original. */
type JustLogged = { entry: FuelEntry; food: QuickAddFood; portion: Portion };

/**
 * One-tap logging, with a short-lived chance to say it was half or double. A tap logs one
 * serving immediately — the common case stays one tap — and then offers the portions and
 * an undo for the entry it made. A correction scales the food the chip carried rather than
 * the entry, so ×2 then ×0.5 lands on half a serving, not on one.
 *
 * The label is kept as it is: the frequent list groups by label, and "Chicken ×2" would
 * split one food into two chips.
 */
export function QuickAdd({ foods, date, errors }: { foods: QuickAddFood[]; date: LocalDate; errors: MutationErrorSlot }) {
  const qc = useQueryClient();
  const [justLogged, setJustLogged] = useState<JustLogged | null>(null);
  const log = useLogFuel(errors);
  const invalidateFuel = () => qc.invalidateQueries({ queryKey: FUEL_KEY });
  const rescale = useTrackedMutation(errors, {
    mutationFn: ({ id, ...body }: UpdateFuelEntryBody & { id: string }) => api.patch<FuelEntry>(`/api/fuel/${id}`, body),
    onSuccess: invalidateFuel,
  });
  const undo = useTrackedMutation(errors, {
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/fuel/${id}`),
    onSuccess: () => {
      setJustLogged(null);
      return invalidateFuel();
    },
  });

  useEffect(() => {
    if (!justLogged) return;
    const t = setTimeout(() => setJustLogged(null), PORTION_ROW_MS);
    return () => clearTimeout(t);
  }, [justLogged]);

  const logFood = (food: QuickAddFood) =>
    log.mutate(
      { ...quickAddBody(food, 1), loggedAt: loggedAtFor(date, new Date()) },
      { onSuccess: (entry) => setJustLogged({ entry, food, portion: 1 }) },
    );

  const choosePortion = (portion: Portion) => {
    if (!justLogged || portion === justLogged.portion) return;
    const { entry, food } = justLogged;
    rescale.mutate(
      { id: entry.id, label: entry.label, ...scaleFood(food, portion), portion },
      { onSuccess: () => setJustLogged({ entry, food, portion }) },
    );
  };

  const busy = rescale.isPending || undo.isPending;
  return (
    <>
      <div className="quickadd">
        {foods.map((food) => (
          <button
            key={food.source === "item" ? food.itemId : food.label}
            className="chip"
            onClick={() => logFood(food)}
            disabled={log.isPending}
          >
            + {food.label} {fuelMacroSummary(food)}
          </button>
        ))}
      </div>
      <div role="status" aria-live="polite">
        {justLogged && (
          <div className="just-logged">
            <p className="jl-text">
              Logged <b>{justLogged.entry.label}</b> · {fuelMacroSummary(scaleFood(justLogged.food, justLogged.portion))}
            </p>
            <div className="jl-actions">
              <div className="jl-portions" role="group" aria-label="Portion">
                {PORTIONS.map((p) => (
                  <button
                    key={p}
                    className={`jl-portion${p === justLogged.portion ? " on" : ""}`}
                    aria-pressed={p === justLogged.portion}
                    disabled={busy}
                    onClick={() => choosePortion(p)}
                  >
                    ×{p}
                  </button>
                ))}
              </div>
              <button className="jl-undo" disabled={busy} onClick={() => undo.mutate(justLogged.entry.id)}>
                Undo
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
