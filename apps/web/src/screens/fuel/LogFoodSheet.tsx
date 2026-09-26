import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AddFuelEntryBody, FrequentFuel, FuelEntry, FuelItem, SaveFuelItemBody } from "@afya/shared";
import { api } from "@/lib/api/client";
import {
  canLogFood,
  EMPTY_FOOD_DRAFT,
  foodBody,
  fuelMacroSummary,
  PORTIONS,
  scaleFood,
  stepPortion,
  type FoodDraft,
} from "@/lib/fuel";
import { earliestFuelDate, fromDateTimeLocal, localDateOf, loggedAtFor, toDateTimeLocal, type LocalDate } from "@/lib/fuel-date";
import { useTrackedMutation, type MutationErrorSlot } from "@/lib/query/use-mutation-error";
import { matchesQuery, queryTokens } from "@/lib/search";
import { FUEL_KEY, useFuelItems } from "./fuel-day";
import { FoodFields } from "./FoodFields";

/** A pickable food: one of the user's saved foods, or a label they type often. */
type SheetFood =
  | { source: "item"; key: string; item: FuelItem }
  | { source: "typed"; key: string; food: FrequentFuel };

const foodLabel = (f: SheetFood) => (f.source === "item" ? f.item.label : f.food.label);
const foodMacros = (f: SheetFood) => (f.source === "item" ? f.item : f.food);

type Tab = "foods" | "numbers";

/** What the sheet sends: an entry, and a saved food to create first when "Save as one of my foods" is ticked. */
type LogRequest = { entry: AddFuelEntryBody; saveAs: SaveFuelItemBody | null };

/**
 * The one way to log something that isn't a one-tap chip: pick one of your foods and a
 * portion, or type the numbers. Either way the entry lands at "When", which starts at now
 * on the day the Fuel page is showing.
 */
export function LogFoodSheet({
  open,
  onClose,
  date,
  errors,
}: {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  errors: MutationErrorSlot;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();
  const { data } = useFuelItems();
  const [tab, setTab] = useState<Tab>("foods");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<SheetFood | null>(null);
  const [portion, setPortion] = useState(1);
  const [draft, setDraft] = useState<FoodDraft>(EMPTY_FOOD_DRAFT);
  const [saveAs, setSaveAs] = useState(false);
  const [unit, setUnit] = useState("");
  const [when, setWhen] = useState("");
  // A food already saved by this request. Retrying after the entry failed must not save it
  // twice — the second POST would be refused as a duplicate name.
  const savedItem = useRef<FuelItem | null>(null);

  // The native dialog owns focus, Escape and the backdrop; React only says whether it is open.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      setWhen(toDateTimeLocal(loggedAtFor(date, new Date()) ?? new Date().toISOString()));
      el.showModal();
    }
    if (!open && el.open) el.close();
  }, [open, date]);

  const reset = () => {
    setTab("foods");
    setQuery("");
    setPicked(null);
    setPortion(1);
    setDraft(EMPTY_FOOD_DRAFT);
    setSaveAs(false);
    setUnit("");
    savedItem.current = null;
  };

  const log = useTrackedMutation(errors, {
    mutationFn: async ({ entry, saveAs: save }: LogRequest) => {
      if (save && !savedItem.current) savedItem.current = await api.post<FuelItem>("/api/fuel/items", save);
      const item = save ? savedItem.current : null;
      return api.post<FuelEntry>("/api/fuel", item ? { ...entry, itemId: item.id } : entry);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: FUEL_KEY });
      reset();
      onClose();
    },
  });

  const options: SheetFood[] = [
    ...(data?.items ?? []).map((item): SheetFood => ({ source: "item", key: item.id, item })),
    ...(data?.unsaved ?? []).map((food): SheetFood => ({ source: "typed", key: `typed:${food.label}`, food })),
  ];
  const tokens = queryTokens(query);
  const matches = tokens.length === 0 ? options : options.filter((o) => matchesQuery(foodLabel(o), tokens));
  const loggedAt = fromDateTimeLocal(when);

  // Creating is an explicit last row, offered only when nothing answers to the name — the rule that fixed ISS-008.
  const createFromQuery = () => {
    setTab("numbers");
    setDraft({ ...EMPTY_FOOD_DRAFT, label: query.trim() });
    setSaveAs(true);
  };

  const pickedTotals = picked ? scaleFood(foodMacros(picked), portion) : null;
  const canLogPicked = !!picked && loggedAt !== null;
  const canLogNumbers = canLogFood(draft) && loggedAt !== null && (!saveAs || unit.trim() !== "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (log.isPending || !loggedAt) return;
    if (tab === "foods" && picked && pickedTotals) {
      log.mutate({
        entry: {
          label: foodLabel(picked),
          ...pickedTotals,
          portion,
          itemId: picked.source === "item" ? picked.item.id : null,
          loggedAt,
        },
        saveAs: null,
      });
    }
    if (tab === "numbers" && canLogNumbers) {
      log.mutate({
        entry: { ...foodBody(draft), loggedAt },
        saveAs: saveAs ? { ...foodBody(draft), unit: unit.trim() } : null,
      });
    }
  };

  const cta =
    tab === "foods"
      ? picked
        ? `Log ${portion} × ${foodLabel(picked)}`
        : "Pick a food"
      : draft.label.trim()
        ? `Log ${draft.label.trim()}`
        : "Log";

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label="Log food"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form className="sheet-body" onSubmit={submit}>
        <div className="sheet-head">
          <h2>Log food</h2>
          <button type="button" className="fuel-cancel sheet-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="sheet-tabs" role="tablist" aria-label="How to log">
          <button type="button" role="tab" aria-selected={tab === "foods"} onClick={() => setTab("foods")}>
            Your foods
          </button>
          <button type="button" role="tab" aria-selected={tab === "numbers"} onClick={() => setTab("numbers")}>
            Just numbers
          </button>
        </div>

        {tab === "foods" && (
          <>
            <input
              className="fuel-name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your foods"
              aria-label="Search your foods"
            />
            <ul className="sheet-foods">
              {matches.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    className={`food-row${picked?.key === o.key ? " picked" : ""}`}
                    aria-pressed={picked?.key === o.key}
                    onClick={() => {
                      setPicked(o);
                      setPortion(1);
                    }}
                  >
                    <span className="food-row-main">
                      <span className="food-row-name">{foodLabel(o)}</span>
                      <span className="food-row-meta">
                        {o.source === "item" ? `per ${o.item.unit} · ` : "typed · "}
                        {fuelMacroSummary(foodMacros(o))}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {tokens.length > 0 && matches.length === 0 && (
                <li>
                  <button type="button" className="food-row sheet-create" onClick={createFromQuery}>
                    + New food “{query.trim()}”
                  </button>
                </li>
              )}
            </ul>

            {picked && pickedTotals && (
              <div className="sheet-portion">
                <div className="sheet-portion-chips" role="group" aria-label="Portion">
                  {PORTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`jl-portion${p === portion ? " on" : ""}`}
                      aria-pressed={p === portion}
                      onClick={() => setPortion(p)}
                    >
                      ×{p}
                    </button>
                  ))}
                </div>
                <div className="sheet-portion-step">
                  <button type="button" className="step" aria-label="Less" onClick={() => setPortion(stepPortion(portion, -1))}>
                    −
                  </button>
                  <span className="sheet-portion-value">×{portion}</span>
                  <button type="button" className="step" aria-label="More" onClick={() => setPortion(stepPortion(portion, 1))}>
                    +
                  </button>
                </div>
                <p className="sheet-preview">{fuelMacroSummary(pickedTotals) || "nothing"}</p>
              </div>
            )}
          </>
        )}

        {tab === "numbers" && (
          <>
            <FoodFields draft={draft} onChange={setDraft} />
            <label className="sheet-check">
              <input type="checkbox" checked={saveAs} onChange={(e) => setSaveAs(e.target.checked)} />
              Save as one of my foods
            </label>
            {saveAs && (
              <label className="fuel-when">
                <span className="fuel-field-label">One unit is</span>
                <input
                  className="fuel-name food-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="1 bar, 100 g…"
                />
              </label>
            )}
          </>
        )}

        <label className="fuel-when">
          <span className="fuel-field-label">When</span>
          <input
            type="datetime-local"
            min={`${earliestFuelDate(localDateOf(new Date()))}T00:00`}
            max={toDateTimeLocal(new Date().toISOString())}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>

        <button
          type="submit"
          className="fuel-save sheet-cta"
          disabled={log.isPending || (tab === "foods" ? !canLogPicked : !canLogNumbers)}
        >
          {log.isPending ? "…" : cta}
        </button>
      </form>
    </dialog>
  );
}
