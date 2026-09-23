import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddDayExerciseBody,
  CatalogExercise,
  CreateExerciseBody,
  Exercise,
  ExerciseAlternative,
  Program,
  ProgramDay,
  TodayResponse,
  UpdateDayBody,
  UpdateDayExerciseBody,
  UpdateProgramBody,
} from "@afya/shared";
import { ErrorBanner } from "@/components/ErrorBanner";
import { TaxonomyTags } from "@/components/TaxonomyTags";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useMutationError, useTrackedMutation } from "@/lib/query/use-mutation-error";
import { fmtDur } from "@/lib/format";
import { ExercisePicker } from "@/components/ExercisePicker";
import { pickFromAlternative, type ExercisePick } from "@/lib/exercise-pick";
import { useArmedConfirm } from "@/lib/use-armed-confirm";

const deleteDayStakes = (sessionCount: number) =>
  sessionCount === 0
    ? "no sessions logged"
    : sessionCount === 1
      ? "1 session keeps its name"
      : `${sessionCount} sessions keep their name`;

/** The library row a pick refers to, creating it first when the pick was to create one. */
async function resolveExerciseId(pick: ExercisePick): Promise<string> {
  if (pick.source === "library") return pick.exerciseId;
  // A catalog pick sends no kind: the server reads kind, muscle group and equipment
  // off the catalog entry, which is exactly what makes a picked name a tagged one.
  const body: CreateExerciseBody = pick.source === "catalog" ? { name: pick.name } : { name: pick.name, kind: pick.kind };
  const created = await api.post<Exercise>("/api/exercises", body);
  return created.id;
}

/** Which panel a program-exercise row has expanded, if any. */
type OpenPanel = { dayExerciseId: string; exerciseId: string; panel: "swap" | "tags" };

/** What a row's grouping reads as on the button that edits it. */
const groupingLabel = (section: string | null, supersetGroup: string | null): string => {
  const parts = [section, supersetGroup && `Superset ${supersetGroup}`].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : "+ Section / superset";
};

export function ProgramScreen() {
  const qc = useQueryClient();
  const programsQ = useQuery({ queryKey: ["programs"], queryFn: () => api.get<Program[]>("/api/programs") });
  const libraryQ = useQuery({ queryKey: ["exercises"], queryFn: () => api.get<Exercise[]>("/api/exercises") });
  const todayQ = useQuery({ queryKey: ["today"], queryFn: () => api.get<TodayResponse>("/api/sessions/today") });
  const catalogQ = useQuery({
    queryKey: ["exercise-catalog"],
    queryFn: () => api.get<CatalogExercise[]>("/api/exercises/catalog"),
    staleTime: Infinity,
  });

  const program = programsQ.data?.[0] ?? null;
  const [selDayId, setSelDayId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [progName, setProgName] = useState("");
  const deleteDayConfirm = useArmedConfirm<string>();
  const removeExConfirm = useArmedConfirm<string>();
  /**
   * The one open panel on an exercise row. Both panels expand the same card, so only
   * one is open at a time — two at once buries the row they belong to.
   */
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(null);
  const errors = useMutationError();

  const swapExerciseId = openPanel?.panel === "swap" ? openPanel.exerciseId : null;
  const alternativesQ = useQuery({
    queryKey: ["alternatives", swapExerciseId],
    queryFn: () => api.get<ExerciseAlternative[]>(`/api/exercises/${swapExerciseId}/alternatives`),
    enabled: swapExerciseId !== null,
  });

  useEffect(() => {
    if (program && (!selDayId || !program.days.some((d) => d.id === selDayId))) {
      setSelDayId(program.days[0]?.id ?? null);
    }
  }, [program, selDayId]);

  useEffect(() => {
    if (program) setProgName(program.name);
  }, [program?.id, program?.name]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["programs"] });
    qc.invalidateQueries({ queryKey: ["exercises"] });
    qc.invalidateQueries({ queryKey: ["today"] });
  };

  const createProgram = useTrackedMutation(errors, {
    mutationFn: (name: string) => api.post<Program>("/api/programs", { name }),
    onSuccess: () => invalidate(),
  });
  const renameProgram = useTrackedMutation(errors, {
    mutationFn: (name: string) => api.patch(`/api/programs/${program!.id}`, { name } satisfies UpdateProgramBody),
    onSuccess: () => invalidate(),
  });
  const addDay = useTrackedMutation(errors, {
    mutationFn: (name: string) => api.post<ProgramDay>(`/api/programs/${program!.id}/days`, { name }),
    onSuccess: (day) => {
      setSelDayId(day.id);
      invalidate();
    },
  });
  const renameDay = useTrackedMutation(errors, {
    mutationFn: ({ dayId, name }: { dayId: string; name: string }) => api.patch(`/api/programs/days/${dayId}`, { name }),
    onSuccess: () => invalidate(),
  });
  const deleteDay = useTrackedMutation(errors, {
    mutationFn: (dayId: string) => api.delete(`/api/programs/days/${dayId}`),
    onSuccess: () => {
      deleteDayConfirm.disarm();
      invalidate();
    },
  });
  const reorderDays = useTrackedMutation(errors, {
    mutationFn: (order: string[]) => api.post(`/api/programs/${program!.id}/days/reorder`, { order }),
    onSuccess: () => invalidate(),
  });
  const addExercise = useTrackedMutation(errors, {
    mutationFn: async ({ dayId, pick }: { dayId: string; pick: ExercisePick }) => {
      const exerciseId = await resolveExerciseId(pick);
      return api.post(`/api/programs/days/${dayId}/exercises`, { exerciseId } satisfies AddDayExerciseBody);
    },
    onSuccess: () => invalidate(),
  });
  /** Replace what a slot trains in place — same position, section, superset and targets. */
  const swapExercise = useTrackedMutation(errors, {
    mutationFn: async ({ dayExerciseId, pick }: { dayExerciseId: string; pick: ExercisePick }) => {
      const exerciseId = await resolveExerciseId(pick);
      return api.patch(`/api/programs/day-exercises/${dayExerciseId}`, { exerciseId } satisfies UpdateDayExerciseBody);
    },
    onSuccess: () => {
      setOpenPanel(null);
      invalidate();
    },
  });
  const updateDay = useTrackedMutation(errors, {
    mutationFn: ({ dayId, patch }: { dayId: string; patch: UpdateDayBody }) => api.patch(`/api/programs/days/${dayId}`, patch),
    onSuccess: () => invalidate(),
  });
  const updateEx = useTrackedMutation(errors, {
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDayExerciseBody }) => api.patch(`/api/programs/day-exercises/${id}`, patch),
    onSuccess: () => invalidate(),
  });
  const deleteEx = useTrackedMutation(errors, {
    mutationFn: (id: string) => api.delete(`/api/programs/day-exercises/${id}`),
    onSuccess: () => {
      removeExConfirm.disarm();
      invalidate();
    },
  });
  const reorderEx = useTrackedMutation(errors, {
    mutationFn: ({ dayId, order }: { dayId: string; order: string[] }) =>
      api.post(`/api/programs/days/${dayId}/exercises/reorder`, { order }),
    onSuccess: () => invalidate(),
  });

  if (programsQ.isLoading) return <p className="center-note">Loading program…</p>;

  if (!program) {
    return (
      <>
        <div className="view-head">
          <p className="eyebrow">Program</p>
          <h1>New program</h1>
        </div>
        {errors.failure && <ErrorBanner message={errors.failure.message} onRetry={errors.failure.retry} />}
        <section className="empty-state">
          <h2>Name your program</h2>
          <p>A program is a set of days you rotate through — Push, Pull, Legs, whatever you run.</p>
          <div className="addex" style={{ width: "100%" }}>
            <input
              placeholder="e.g. PPL — Summer '26"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName.trim() && createProgram.mutate(newName.trim())}
            />
            <button onClick={() => newName.trim() && createProgram.mutate(newName.trim())}>Create</button>
          </div>
        </section>
      </>
    );
  }

  const days = program.days;
  const nextDayId = todayQ.data?.day?.id ?? null;
  const selDay = days.find((d) => d.id === selDayId) ?? days[0] ?? null;
  const selIdx = selDay ? days.findIndex((d) => d.id === selDay.id) : -1;

  function moveDay(dir: -1 | 1) {
    if (selIdx < 0) return;
    const j = selIdx + dir;
    if (j < 0 || j >= days.length) return;
    const order = days.map((d) => d.id);
    [order[selIdx], order[j]] = [order[j]!, order[selIdx]!];
    reorderDays.mutate(order);
  }
  function moveEx(dayId: string, exOrder: string[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= exOrder.length) return;
    const order = [...exOrder];
    [order[i], order[j]] = [order[j]!, order[i]!];
    reorderEx.mutate({ dayId, order });
  }

  const inDay = new Set(selDay?.exercises.map((e) => e.exerciseId));

  return (
    <>
      <div className="view-head">
        <p className="eyebrow">Program</p>
        <div className="prog-name">
          <input
            aria-label="Program name"
            value={progName}
            onChange={(e) => setProgName(e.target.value)}
            onBlur={() => {
              const n = progName.trim();
              if (!n) return setProgName(program.name);
              if (n !== program.name) renameProgram.mutate(n);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </div>
      </div>

      {errors.failure && <ErrorBanner message={errors.failure.message} onRetry={errors.failure.retry} />}

      {days.length > 0 && (
        <div className="rotation">
          {days.map((d, i) => (
            <div key={d.id} style={{ display: "contents" }}>
              <div className={`rot-seg${d.id === nextDayId ? " next" : ""}`}>
                <span className="rn">{i + 1}</span>
                <span className="rnm">{d.name}</span>
                {d.id === nextDayId && <span className="rot-tag">next</span>}
              </div>
              {i < days.length - 1 && <span className="rot-arrow">→</span>}
            </div>
          ))}
          <span className="rot-arrow">⟳</span>
        </div>
      )}

      <div className="day-chips">
        {days.map((d, i) => (
          <button
            key={d.id}
            className={`day-chip${d.id === selDay?.id ? " sel" : ""}`}
            onClick={() => {
              setSelDayId(d.id);
              deleteDayConfirm.disarm();
              removeExConfirm.disarm();
              setOpenPanel(null);
            }}
          >
            <span className="badge">{String.fromCharCode(65 + i)}</span>
            {d.name}
          </button>
        ))}
        <button className="day-chip add" onClick={() => addDay.mutate("New day")}>
          + Day
        </button>
      </div>

      {selDay && (
        <div className="day-editor">
          <div className="de-head">
            <input
              key={selDay.id}
              defaultValue={selDay.name}
              aria-label="Day name"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== selDay.name) renameDay.mutate({ dayId: selDay.id, name: v });
              }}
            />
            {deleteDayConfirm.armed === selDay.id ? (
              <button className="de-del armed" onClick={() => deleteDay.mutate(selDay.id)}>
                Tap again to delete “{selDay.name}” · {deleteDayStakes(selDay.sessionCount)}
              </button>
            ) : (
              <button className="de-del" onClick={() => deleteDayConfirm.arm(selDay.id)}>
                Delete day
              </button>
            )}
          </div>

          <div className="de-rot">
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Rotation position
            </p>
            <div className="rot-move">
              <button onClick={() => moveDay(-1)} disabled={selIdx <= 0}>
                ‹ Earlier
              </button>
              <span className="rot-pos">
                {selIdx + 1} of {days.length}
              </span>
              <button onClick={() => moveDay(1)} disabled={selIdx >= days.length - 1}>
                Later ›
              </button>
            </div>
          </div>

          <div className="de-block">
            <p className="eyebrow">Warm-up</p>
            <textarea
              key={`${selDay.id}:wu`}
              defaultValue={selDay.warmup ?? ""}
              placeholder="Warm-up — mobility, light prep sets…"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (selDay.warmup ?? null)) updateDay.mutate({ dayId: selDay.id, patch: { warmup: v } });
              }}
            />
          </div>

          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Exercises
            </p>
            <ul className="pex-list">
              {selDay.exercises.flatMap((ex, i, list) => {
                const order = list.map((x) => x.id);
                const prev = list[i - 1];
                const next = list[i + 1];
                const g = ex.supersetGroup;
                const inSS = !!g && (prev?.supersetGroup === g || next?.supersetGroup === g);
                const ssStart = inSS && prev?.supersetGroup !== g;
                const showSection = i === 0 || prev?.section !== ex.section;
                const swapOpen = openPanel?.dayExerciseId === ex.id && openPanel.panel === "swap";
                const tagsOpen = openPanel?.dayExerciseId === ex.id && openPanel.panel === "tags";
                return [
                  showSection ? (
                    <li key={`sec-${ex.id}`} className="pex-section">
                      {ex.section || "Exercises"}
                    </li>
                  ) : null,
                  ssStart ? (
                    <li key={`ss-${ex.id}`} className="ss-head">
                      Superset {g}
                    </li>
                  ) : null,
                  <li key={ex.id} className={`pex${inSS ? " in-ss" : ""}`}>
                    <div className="pex-ord">
                      <button className="ord" disabled={i === 0} onClick={() => moveEx(selDay.id, order, i, -1)}>
                        ↑
                      </button>
                      <button className="ord" disabled={i === list.length - 1} onClick={() => moveEx(selDay.id, order, i, 1)}>
                        ↓
                      </button>
                    </div>
                    <div className="pex-body">
                      <div className="pex-top">
                        <span className="pex-name">
                          {ex.name}
                          {ex.kind !== "weighted" && <span className="kind-tag">{ex.kind === "time" ? "time" : "reps"}</span>}
                        </span>
                        <span className="pex-actions">
                          <button
                            className={`pex-swap${swapOpen ? " on" : ""}`}
                            aria-expanded={swapOpen}
                            onClick={() =>
                              setOpenPanel(swapOpen ? null : { dayExerciseId: ex.id, exerciseId: ex.exerciseId, panel: "swap" })
                            }
                          >
                            Swap ⇄
                          </button>
                          {removeExConfirm.armed === ex.id ? (
                            <button className="pex-del armed" onClick={() => deleteEx.mutate(ex.id)}>
                              Remove?
                            </button>
                          ) : (
                            <button className="pex-del" aria-label={`Remove ${ex.name}`} onClick={() => removeExConfirm.arm(ex.id)}>
                              ×
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="pex-ctl">
                        <div className="ctl">
                          <span className="ctl-lbl">Sets</span>
                          <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetSets: Math.max(1, ex.targetSets - 1) } })}>−</button>
                          <b>{ex.targetSets}</b>
                          <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetSets: ex.targetSets + 1 } })}>+</button>
                        </div>
                        {ex.kind === "time" ? (
                          <div className="ctl">
                            <span className="ctl-lbl">Time</span>
                            <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetDurationSec: Math.max(5, (ex.targetDurationSec ?? 30) - 5) } })}>−</button>
                            <b>{fmtDur(ex.targetDurationSec ?? 30)}</b>
                            <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetDurationSec: (ex.targetDurationSec ?? 30) + 5 } })}>+</button>
                          </div>
                        ) : (
                          <div className={`ctl${ex.targetRepsMax == null ? "" : " ctl-range"}`}>
                            <span className="ctl-lbl">Reps</span>
                            <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetReps: Math.max(1, ex.targetReps - 1) } })}>−</button>
                            <b>{ex.targetReps}</b>
                            <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetReps: ex.targetReps + 1 } })}>+</button>
                            {ex.targetRepsMax == null ? (
                              <button className="ctl-add" onClick={() => updateEx.mutate({ id: ex.id, patch: { targetRepsMax: ex.targetReps + 2 } })}>
                                + range
                              </button>
                            ) : (
                              <span className="ctl-grp">
                                <span className="ctl-to">–</span>
                                <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetRepsMax: Math.max(ex.targetReps, ex.targetRepsMax! - 1) } })}>−</button>
                                <b>{ex.targetRepsMax}</b>
                                <button onClick={() => updateEx.mutate({ id: ex.id, patch: { targetRepsMax: ex.targetRepsMax! + 1 } })}>+</button>
                                <button className="ctl-clear" aria-label="Clear range" onClick={() => updateEx.mutate({ id: ex.id, patch: { targetRepsMax: null } })}>
                                  ✕
                                </button>
                              </span>
                            )}
                          </div>
                        )}
                        <div className="ctl">
                          <span className="ctl-lbl">Rest</span>
                          {ex.restSec == null ? (
                            <button className="ctl-add" onClick={() => updateEx.mutate({ id: ex.id, patch: { restSec: 60 } })}>
                              + rest
                            </button>
                          ) : (
                            <>
                              <button onClick={() => updateEx.mutate({ id: ex.id, patch: { restSec: Math.max(0, ex.restSec! - 15) } })}>−</button>
                              <b>{ex.restSec}s</b>
                              <button onClick={() => updateEx.mutate({ id: ex.id, patch: { restSec: ex.restSec! + 15 } })}>+</button>
                              <button className="ctl-clear" aria-label="Clear rest" onClick={() => updateEx.mutate({ id: ex.id, patch: { restSec: null } })}>
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <input
                        className="pex-note"
                        key={`${ex.id}:note`}
                        defaultValue={ex.note ?? ""}
                        placeholder="Note / coaching cue…"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (ex.note ?? "")) updateEx.mutate({ id: ex.id, patch: { note: v || null } });
                        }}
                      />
                      <button
                        className={`pex-grouping${ex.section || ex.supersetGroup ? " set" : ""}${tagsOpen ? " on" : ""}`}
                        aria-expanded={tagsOpen}
                        onClick={() =>
                          setOpenPanel(tagsOpen ? null : { dayExerciseId: ex.id, exerciseId: ex.exerciseId, panel: "tags" })
                        }
                      >
                        {groupingLabel(ex.section, ex.supersetGroup)}
                      </button>
                      {tagsOpen && (
                        <div className="pex-grouping-panel">
                          <div className="pex-field">
                            <label className="pex-field-lbl">
                              Section
                              <input
                                // Keyed on the stored value so a refetch re-syncs the field. A stable key
                                // left a rejected edit sitting in an uncontrolled input, reading as saved.
                                key={`${ex.id}:sec:${ex.section ?? ""}`}
                                defaultValue={ex.section ?? ""}
                                placeholder="e.g. Main lifts"
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v !== (ex.section ?? "")) updateEx.mutate({ id: ex.id, patch: { section: v || null } });
                                }}
                              />
                            </label>
                            {ex.section && (
                              <button
                                className="pex-field-clear"
                                aria-label={`Clear section for ${ex.name}`}
                                onClick={() => updateEx.mutate({ id: ex.id, patch: { section: null } })}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="pex-field">
                            <label className="pex-field-lbl">
                              Superset
                              <input
                                key={`${ex.id}:ss:${ex.supersetGroup ?? ""}`}
                                defaultValue={ex.supersetGroup ?? ""}
                                placeholder="e.g. A — same letter pairs them"
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v !== (ex.supersetGroup ?? "")) updateEx.mutate({ id: ex.id, patch: { supersetGroup: v || null } });
                                }}
                              />
                            </label>
                            {ex.supersetGroup && (
                              <button
                                className="pex-field-clear"
                                aria-label={`Clear superset for ${ex.name}`}
                                onClick={() => updateEx.mutate({ id: ex.id, patch: { supersetGroup: null } })}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {swapOpen && (
                        <div className="swap-panel">
                          <p className="eyebrow">Swap for — keeps this slot’s position, targets and tags</p>
                          {alternativesQ.isLoading ? (
                            <p className="swap-note">Finding alternatives…</p>
                          ) : alternativesQ.isError ? (
                            <ErrorBanner message={errorMessage(alternativesQ.error)} onRetry={() => alternativesQ.refetch()} />
                          ) : (alternativesQ.data ?? []).length === 0 ? (
                            <p className="swap-note">No same-muscle alternatives — search below</p>
                          ) : (
                            <ul className="expick-list">
                              {(alternativesQ.data ?? []).map((alt) => (
                                <li key={alt.id ?? alt.name}>
                                  <button
                                    type="button"
                                    disabled={swapExercise.isPending}
                                    onClick={() => swapExercise.mutate({ dayExerciseId: ex.id, pick: pickFromAlternative(alt) })}
                                  >
                                    <span className="expick-name">{alt.name}</span>
                                    <span className="expick-tags">
                                      <TaxonomyTags muscleGroup={alt.primaryMuscleGroup} equipment={alt.equipment} />
                                      {!alt.inLibrary && <span className="expick-badge is-new">new</span>}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <ExercisePicker
                            library={libraryQ.data ?? []}
                            catalog={catalogQ.data ?? []}
                            alreadyInDay={inDay}
                            placeholder="Search for something else…"
                            busy={swapExercise.isPending}
                            onPick={(pick) => swapExercise.mutate({ dayExerciseId: ex.id, pick })}
                          />
                        </div>
                      )}
                    </div>
                  </li>,
                ];
              })}
            </ul>
          </div>

          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Add exercise
            </p>
            <ExercisePicker
              key={selDay.id}
              library={libraryQ.data ?? []}
              catalog={catalogQ.data ?? []}
              alreadyInDay={inDay}
              placeholder="Search your library and the catalog…"
              busy={addExercise.isPending}
              onPick={(pick) => addExercise.mutate({ dayId: selDay.id, pick })}
            />
          </div>

          <div className="de-block">
            <p className="eyebrow">Cool-down</p>
            <textarea
              key={`${selDay.id}:cd`}
              defaultValue={selDay.cooldown ?? ""}
              placeholder="Cool-down — stretches, breathing…"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (selDay.cooldown ?? null)) updateDay.mutate({ dayId: selDay.id, patch: { cooldown: v } });
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
