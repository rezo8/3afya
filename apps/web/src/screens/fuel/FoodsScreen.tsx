import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FrequentFuel, FuelItem, SaveFuelItemBody } from "@afya/shared";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api } from "@/lib/api/client";
import { canSaveItem, EMPTY_ITEM_DRAFT, fuelMacroSummary, itemBody, itemDraftFrom, type ItemDraft } from "@/lib/fuel";
import { useMutationError, useTrackedMutation } from "@/lib/query/use-mutation-error";
import { useArmedConfirm } from "@/lib/use-armed-confirm";
import { FUEL_KEY, useFuelItems } from "./fuel-day";
import { FoodFields } from "./FoodFields";

/** A frequently typed label saved as-is gets this unit until the user names a better one. */
const DEFAULT_UNIT = "1 serving";

/** Which food the form is open on: a new one, or a saved one by id. */
type Editing = { kind: "new" } | { kind: "item"; id: string };

/**
 * The user's own foods. Saving one makes it a chip, in its own unit, ahead of anything
 * typed; editing one changes what gets logged from now on and nothing already logged.
 */
export function FoodsScreen() {
  const qc = useQueryClient();
  const errors = useMutationError();
  const { data } = useFuelItems();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_ITEM_DRAFT);
  const archiveConfirm = useArmedConfirm<string>();

  // Returning the refetch keeps the form's Save pending until the list shows the change.
  const refresh = () => qc.invalidateQueries({ queryKey: FUEL_KEY });
  const create = useTrackedMutation(errors, {
    mutationFn: (body: SaveFuelItemBody) => api.post<FuelItem>("/api/fuel/items", body),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const update = useTrackedMutation(errors, {
    mutationFn: ({ id, ...body }: SaveFuelItemBody & { id: string }) => api.patch<FuelItem>(`/api/fuel/items/${id}`, body),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const archive = useTrackedMutation(errors, {
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/fuel/items/${id}`),
    onSuccess: async () => {
      archiveConfirm.disarm();
      await refresh();
      setEditing(null);
    },
  });

  const open = (next: Editing, from: ItemDraft) => {
    setEditing(next);
    setDraft(from);
  };
  const saving = create.isPending || update.isPending;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !canSaveItem(draft) || saving) return;
    if (editing.kind === "new") create.mutate(itemBody(draft));
    else update.mutate({ id: editing.id, ...itemBody(draft) });
  };
  const saveTyped = (food: FrequentFuel) => create.mutate({ ...food, unit: DEFAULT_UNIT });

  const form = (
    <form className="fuel-edit food-form" onSubmit={submit} aria-label={editing?.kind === "new" ? "New food" : `Edit ${draft.label}`}>
      <FoodFields draft={draft} onChange={(food) => setDraft({ ...draft, ...food })} />
      <label className="fuel-when">
        <span className="fuel-field-label">One unit is</span>
        <input
          className="fuel-name food-unit"
          value={draft.unit}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
          placeholder="1 scoop, 100 g…"
        />
      </label>
      <p className="food-note">The numbers are for one unit. Entries already logged keep their own numbers.</p>
      <div className="fuel-edit-actions">
        {editing?.kind === "item" && (
          <button
            type="button"
            className={`fuel-cancel food-archive${archiveConfirm.armed === editing.id ? " armed" : ""}`}
            disabled={archive.isPending}
            onClick={() =>
              archiveConfirm.armed === editing.id ? archive.mutate(editing.id) : archiveConfirm.arm(editing.id)
            }
          >
            {archiveConfirm.armed === editing.id ? "Archive it?" : "Archive"}
          </button>
        )}
        <button type="button" className="fuel-cancel" onClick={() => setEditing(null)}>
          Cancel
        </button>
        <button type="submit" className="fuel-save" disabled={!canSaveItem(draft) || saving}>
          {saving ? "…" : "Save"}
        </button>
      </div>
    </form>
  );

  return (
    <>
      <Link to="/fuel" className="back-link">
        ‹ Fuel
      </Link>
      <div className="view-head fuel-head">
        <div>
          <p className="eyebrow">Fuel</p>
          <h1>My foods</h1>
        </div>
        {editing?.kind !== "new" && (
          <button className="fuel-save" onClick={() => open({ kind: "new" }, EMPTY_ITEM_DRAFT)}>
            + New food
          </button>
        )}
      </div>
      <p className="food-intro">Your own foods, in your own units. Nothing here comes from a database.</p>

      {errors.failure && <ErrorBanner message={errors.failure.message} onRetry={errors.failure.retry} />}
      {editing?.kind === "new" && form}

      {data && (
        <section className="food-list">
          {data.items.length === 0 && editing?.kind !== "new" && (
            <p className="food-empty">No saved foods yet. Save one here, or save a logged entry from the Fuel page.</p>
          )}
          <ul>
            {data.items.map((item) =>
              editing?.kind === "item" && editing.id === item.id ? (
                <li key={item.id}>{form}</li>
              ) : (
                <li key={item.id}>
                  <button className="food-row" onClick={() => open({ kind: "item", id: item.id }, itemDraftFrom(item))}>
                    <span className="food-row-main">
                      <span className="food-row-name">{item.label}</span>
                      <span className="food-row-meta">
                        per {item.unit} · {fuelMacroSummary(item)}
                      </span>
                    </span>
                    <span className="food-row-count">{item.timesLogged}×</span>
                  </button>
                </li>
              ),
            )}
          </ul>

          {data.unsaved.length > 0 && (
            <>
              <p className="eyebrow food-section">Logged often, not saved</p>
              <ul>
                {data.unsaved.map((food) => (
                  <li key={food.label} className="food-row unsaved">
                    <span className="food-row-main">
                      <span className="food-row-name">{food.label}</span>
                      <span className="food-row-meta">{fuelMacroSummary(food)}</span>
                    </span>
                    <button className="food-save-typed" disabled={create.isPending} onClick={() => saveTyped(food)}>
                      Save it
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
