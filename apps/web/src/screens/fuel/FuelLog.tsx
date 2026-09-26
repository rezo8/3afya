import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FuelEntry, FuelItem, UpdateFuelEntryBody } from "@afya/shared";
import { api } from "@/lib/api/client";
import { canLogFood, foodBody, foodDraftFrom, fuelMacroSummary, servingOf, type FoodDraft } from "@/lib/fuel";
import { earliestFuelDate, fromDateTimeLocal, localDateOf, loggedAtFor, toDateTimeLocal, type LocalDate } from "@/lib/fuel-date";
import { groupByPartOfDay, PART_LABEL, partOfDay } from "@/lib/fuel-log";
import { useTrackedMutation, type MutationErrorSlot } from "@/lib/query/use-mutation-error";
import { useArmedConfirm } from "@/lib/use-armed-confirm";
import { FUEL_KEY, useLogFuel } from "./fuel-day";
import { FoodFields } from "./FoodFields";

/** An entry being corrected: its food, and when it was eaten as the `datetime-local` input holds it. */
type EntryDraft = FoodDraft & { id: string; when: string };

/** The unit a logged entry is saved under until the user names a better one. */
const SAVED_ENTRY_UNIT = "1 serving";

const timeOfDay = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * A day's entries, grouped by part of the day. Tapping an entry opens its actions — edit,
 * log again, remove — rather than doing any of them, so a tap aimed at a row never destroys it.
 */
export function FuelLog({
  entries,
  date,
  isToday,
  errors,
}: {
  entries: FuelEntry[];
  date: LocalDate;
  isToday: boolean;
  errors: MutationErrorSlot;
}) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const removeConfirm = useArmedConfirm<string>();

  const invalidateFuel = () => qc.invalidateQueries({ queryKey: FUEL_KEY });
  const logAgain = useLogFuel(errors);
  const remove = useTrackedMutation(errors, {
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/fuel/${id}`),
    onSuccess: () => {
      removeConfirm.disarm();
      setOpenId(null);
      return invalidateFuel();
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

  const groups = groupByPartOfDay(entries, isToday ? partOfDay(new Date()) : null);
  if (groups.length === 0) return null;

  const toggle = (id: string) => {
    removeConfirm.disarm();
    setOpenId((current) => (current === id ? null : id));
  };
  const openEdit = (entry: FuelEntry) => {
    setOpenId(null);
    setEntryDraft({ id: entry.id, ...foodDraftFrom(entry), when: toDateTimeLocal(entry.loggedAt) });
  };
  // Same food and portion, on the day being viewed — the same rule every other log on this page follows.
  const again = (entry: FuelEntry) =>
    logAgain.mutate(
      {
        ...foodBody(foodDraftFrom(entry)),
        portion: entry.portion,
        itemId: entry.itemId,
        loggedAt: loggedAtFor(date, new Date()),
      },
      { onSuccess: () => setOpenId(null) },
    );

  const entryLoggedAt = entryDraft ? fromDateTimeLocal(entryDraft.when) : null;
  const canSaveEntry = !!entryDraft && canLogFood(entryDraft) && entryLoggedAt !== null;
  const submitEntry = (e: FormEvent) => {
    e.preventDefault();
    if (!entryDraft || !entryLoggedAt || !canSaveEntry || update.isPending) return;
    update.mutate({ id: entryDraft.id, ...foodBody(entryDraft), loggedAt: entryLoggedAt });
  };

  return (
    <div className="fuel-log">
      {groups.map((group) => (
        <section key={group.part} className="fuel-part" aria-label={PART_LABEL[group.part]}>
          <div className="fuel-part-head">
            <p className="eyebrow">{PART_LABEL[group.part]}</p>
            {group.entries.length > 0 && (
              <span className="fuel-part-total">
                {fuelMacroSummary({ proteinG: group.proteinG, calories: group.calories, carbsG: null, fatG: null })}
              </span>
            )}
          </div>
          {group.entries.length === 0 ? (
            <p className="fuel-part-empty">Nothing yet</p>
          ) : (
            <ul>
              {group.entries.map((entry) =>
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
                  <li key={entry.id} className={`fuel-row${openId === entry.id ? " open" : ""}`}>
                    <button
                      className="fr-open"
                      aria-expanded={openId === entry.id}
                      aria-label={entry.label}
                      onClick={() => toggle(entry.id)}
                    >
                      <span className="fr-time">{timeOfDay(entry.loggedAt)}</span>
                      <span className="fr-main">
                        <span className="fr-label">{entry.label}</span>
                        <span className="fr-meta">
                          {entry.portion !== null && entry.portion !== 1 && `×${entry.portion} · `}
                          {fuelMacroSummary(entry)}
                        </span>
                      </span>
                    </button>
                    {openId === entry.id && (
                      <div className="fr-actions">
                        <button onClick={() => openEdit(entry)}>Edit</button>
                        <button disabled={logAgain.isPending} onClick={() => again(entry)}>
                          {logAgain.isPending ? "…" : "Log again"}
                        </button>
                        {/* Disabled while pending: the arm window can expire mid-request, and a
                            live control on a row being removed would fire a second delete. */}
                        <button
                          className={`fr-remove${removeConfirm.armed === entry.id ? " armed" : ""}`}
                          aria-live="polite"
                          disabled={remove.isPending}
                          onClick={() =>
                            removeConfirm.armed === entry.id ? remove.mutate(entry.id) : removeConfirm.arm(entry.id)
                          }
                        >
                          {removeConfirm.armed === entry.id ? "Remove?" : "Remove"}
                        </button>
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
