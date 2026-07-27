import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { CreateExerciseBody, Exercise, LoggedSetResult, LogSetBody, PrKind, TodayExercise, TodayResponse, UpdateSetBody } from "@afya/shared";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { PR_LABEL } from "@/lib/pr";
import { isExerciseDone } from "@/lib/session";
import { useRestTimer } from "./RestTimer";

type Work = Record<string, { weight: number; reps: number; durationSec: number }>;

const fmtDur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

export function SessionScreen() {
  const qc = useQueryClient();
  const { dayId } = useParams({ strict: false }) as { dayId?: string };
  const { data, isLoading } = useQuery({
    queryKey: ["session", dayId],
    queryFn: () => api.get<TodayResponse>(`/api/sessions/day/${dayId}`),
    enabled: !!dayId,
  });
  const [work, setWork] = useState<Work>({});
  const [override, setOverride] = useState<string | null>(null);
  const [extras, setExtras] = useState<Exercise[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<Exercise["kind"]>("weighted");
  const [prBanner, setPrBanner] = useState<{ prs: PrKind[]; name: string } | null>(null);
  const [prSets, setPrSets] = useState<Set<string>>(new Set());
  const [mutError, setMutError] = useState<{ message: string; retry: () => void } | null>(null);
  const [nextIsWarmup, setNextIsWarmup] = useState(false);
  const rest = useRestTimer();
  const libraryQ = useQuery({ queryKey: ["exercises"], queryFn: () => api.get<Exercise[]>("/api/exercises") });

  useEffect(() => {
    setExtras([]);
    setShowAdd(false);
    setOverride(null);
    setPrBanner(null);
    setPrSets(new Set());
    setMutError(null);
    setNextIsWarmup(false);
  }, [dayId]);

  useEffect(() => {
    if (!prBanner) return;
    const t = setTimeout(() => setPrBanner(null), 4500);
    return () => clearTimeout(t);
  }, [prBanner]);

  useEffect(() => {
    if (!data) return;
    setWork((prev) => {
      const next = { ...prev };
      for (const ex of data.exercises) {
        if (!next[ex.exerciseId]) {
          next[ex.exerciseId] = {
            weight: ex.lastWeight ?? 45,
            reps: ex.lastReps ?? ex.targetReps ?? 8,
            durationSec: ex.lastDurationSec ?? ex.targetDurationSec ?? 30,
          };
        }
      }
      return next;
    });
  }, [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["session", dayId] });
    qc.invalidateQueries({ queryKey: ["today"] });
  };
  const logSet = useMutation({
    mutationFn: async ({ body }: { body: LogSetBody; name: string }) => {
      let sid = data?.session?.id;
      if (!sid) sid = (await api.post<{ id: string }>("/api/sessions", { dayId })).id;
      return api.post<LoggedSetResult>(`/api/sessions/${sid}/sets`, body);
    },
    onSuccess: (result, vars) => {
      setMutError(null);
      setNextIsWarmup(false);
      invalidate();
      if (result.prs.length) {
        setPrBanner({ prs: result.prs, name: vars.name });
        setPrSets((prev) => new Set(prev).add(result.set.id));
        navigator.vibrate?.([40, 40, 120]);
      }
    },
    onError: (err, vars) => {
      setMutError({ message: errorMessage(err), retry: () => { setMutError(null); logSet.mutate(vars); } });
    },
  });
  const editSet = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: UpdateSetBody }) => api.patch(`/api/sessions/${data!.session!.id}/sets/${setId}`, patch),
    onSuccess: () => {
      setMutError(null);
      invalidate();
    },
    onError: (err, vars) => {
      setMutError({ message: errorMessage(err), retry: () => { setMutError(null); editSet.mutate(vars); } });
    },
  });
  const deleteSet = useMutation({
    mutationFn: (setId: string) => api.delete(`/api/sessions/${data!.session!.id}/sets/${setId}`),
    onSuccess: () => {
      setMutError(null);
      invalidate();
    },
    onError: (err, vars) => {
      setMutError({ message: errorMessage(err), retry: () => { setMutError(null); deleteSet.mutate(vars); } });
    },
  });
  const createEx = useMutation({
    mutationFn: (body: CreateExerciseBody) => api.post<Exercise>("/api/exercises", body),
    onSuccess: () => {
      setMutError(null);
      qc.invalidateQueries({ queryKey: ["exercises"] });
    },
    onError: (err, vars) => {
      setMutError({ message: errorMessage(err), retry: () => { setMutError(null); createEx.mutate(vars); } });
    },
  });

  if (isLoading) return <p className="center-note">Loading…</p>;

  if (!data || !data.day) {
    return (
      <section className="empty-state">
        <h2>Day not found</h2>
        <p>This day may have been removed. Pick another from your program.</p>
        <Link className="btn" to="/">
          Back to days
        </Link>
      </section>
    );
  }

  const serverIds = new Set(data.exercises.map((e) => e.exerciseId));
  const pending: TodayExercise[] = extras
    .filter((ex) => !serverIds.has(ex.id))
    .map((ex) => ({
      exerciseId: ex.id,
      name: ex.name,
      kind: ex.kind,
      fromProgram: false,
      targetSets: 0,
      targetReps: 0,
      targetRepsMax: null,
      targetDurationSec: null,
      restSec: null,
      note: null,
      supersetGroup: null,
      section: null,
      lastWeight: null,
      lastReps: null,
      lastDurationSec: null,
      loggedSets: [],
    }));
  const exercises = [...data.exercises, ...pending];
  const programExercises = exercises.filter((e) => e.fromProgram);
  const addedExercises = exercises.filter((e) => !e.fromProgram);

  const doneCount = programExercises.filter(isExerciseDone).length;
  const activeId =
    override && exercises.some((e) => e.exerciseId === override)
      ? override
      : (exercises.find((e) => !isExerciseDone(e))?.exerciseId ?? null);
  const active = exercises.find((e) => e.exerciseId === activeId) ?? null;

  const focusExercise = (id: string) => {
    setOverride(id);
    setNextIsWarmup(false);
  };
  const addExercise = (ex: Exercise) => {
    setExtras((xs) => (xs.some((x) => x.id === ex.id) ? xs : [...xs, ex]));
    setWork((wk) => (wk[ex.id] ? wk : { ...wk, [ex.id]: { weight: 45, reps: 8, durationSec: 30 } }));
    focusExercise(ex.id);
    setShowAdd(false);
  };
  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      addExercise(await createEx.mutateAsync({ name, kind: newKind }));
      setNewName("");
    } catch {
      // onError above already surfaced the banner; nothing else to do here.
    }
  };
  const inSession = new Set(exercises.map((e) => e.exerciseId));
  const library = (libraryQ.data ?? []).filter((ex) => !inSession.has(ex.id));

  const setWorkFor = (id: string, patch: Partial<Work[string]>) => setWork((wk) => ({ ...wk, [id]: { ...wk[id]!, ...patch } }));

  function pickNextInGroup(justSet: TodayExercise, willBeDone: boolean): string | null {
    const group = programExercises.filter((e) => e.supersetGroup === justSet.supersetGroup);
    const idx = group.findIndex((e) => e.exerciseId === justSet.exerciseId);
    const doneAfter = (e: TodayExercise) => (e.exerciseId === justSet.exerciseId ? willBeDone : isExerciseDone(e));
    for (let step = 1; step <= group.length; step++) {
      const cand = group[(idx + step) % group.length]!;
      if (!doneAfter(cand)) return cand.exerciseId;
    }
    return null;
  }

  function completeSet() {
    if (!active) return;
    const wk = work[active.exerciseId]!;
    const body: LogSetBody = { exerciseId: active.exerciseId, setNumber: active.loggedSets.length + 1, isWarmup: nextIsWarmup };
    if (active.kind === "weighted") {
      body.weight = wk.weight;
      body.reps = wk.reps;
    } else if (active.kind === "reps") {
      body.reps = wk.reps;
    } else {
      body.durationSec = wk.durationSec;
    }
    logSet.mutate({ body, name: active.name });

    const beyondTarget = active.loggedSets.length >= active.targetSets;
    if (!active.fromProgram || beyondTarget) {
      setOverride(active.exerciseId);
    } else {
      const willBeDone = active.loggedSets.length + 1 >= active.targetSets;
      if (active.supersetGroup) {
        setOverride(pickNextInGroup(active, willBeDone));
      } else if (willBeDone) {
        setOverride(null);
      } else {
        setOverride(active.exerciseId);
      }
    }

    rest.start(active.restSec ?? 90);
  }

  const w = active ? work[active.exerciseId] : undefined;
  const activeDone = active ? isExerciseDone(active) : false;
  const pipCount = active ? Math.max(active.targetSets, active.loggedSets.length + 1) : 0;

  let delta: number | null = null;
  let deltaUnit = "";
  if (active && w) {
    if (active.kind === "weighted" && active.lastWeight != null) {
      delta = +(w.weight - active.lastWeight).toFixed(1);
      deltaUnit = "lb";
    } else if (active.kind === "reps" && active.lastReps != null) {
      delta = w.reps - active.lastReps;
      deltaUnit = "reps";
    } else if (active.kind === "time" && active.lastDurationSec != null) {
      delta = w.durationSec - active.lastDurationSec;
      deltaUnit = "s";
    }
  }

  const rowMeta = (e: TodayExercise) => {
    const ew = work[e.exerciseId];
    if (e.kind === "weighted") {
      const wt = ew ? ew.weight : (e.lastWeight ?? "—");
      const rp = ew ? ew.reps : e.targetReps;
      return (
        <>
          <b>{wt}</b>lb × {rp}
        </>
      );
    }
    if (e.kind === "reps") {
      const rp = ew ? ew.reps : (e.lastReps ?? e.targetReps);
      return (
        <>
          <b>{rp}</b> reps
        </>
      );
    }
    const dur = ew ? ew.durationSec : (e.lastDurationSec ?? e.targetDurationSec ?? 0);
    return <b>{fmtDur(dur)}</b>;
  };

  return (
    <>
      <Link to="/" className="back-link">
        ‹ All days
      </Link>
      <div className="today-head">
        <div>
          <p className="eyebrow">Session</p>
          <h1 className="day">
            {data.day.name}
            <span className="split-tag">DAY {String.fromCharCode(65 + data.day.position)}</span>
          </h1>
        </div>
        <div className="session-progress">
          <span className="frac num">
            <b>{doneCount}</b>/{exercises.length}
          </span>
          <span className="lbl">lifts</span>
        </div>
      </div>
      <div className="track">
        <i style={{ width: `${exercises.length ? (doneCount / exercises.length) * 100 : 0}%` }} />
      </div>

      {prBanner && (
        <div className="pr-banner" role="status">
          <span className="pr-trophy">🏆</span>
          <span className="pr-text">
            <b>New PR</b> · {prBanner.name} · {prBanner.prs.map((k) => PR_LABEL[k]).join(" · ")}
          </span>
        </div>
      )}

      {mutError && <ErrorBanner message={mutError.message} onRetry={mutError.retry} />}

      {active ? (
        <div className="setcard">
          <p className="eyebrow">
            {active.fromProgram
              ? activeDone
                ? `Extra · set ${active.loggedSets.length + 1}`
                : `Now · set ${active.loggedSets.length + 1} of ${active.targetSets}`
              : `Added · set ${active.loggedSets.length + 1}`}
          </p>
          <h2 className="lift">{active.name}</h2>
          {active.fromProgram ? (
            <p className="set-target">
              {active.targetSets} ×{" "}
              {active.kind === "time"
                ? fmtDur(active.targetDurationSec ?? 0)
                : active.targetRepsMax
                  ? `${active.targetReps}–${active.targetRepsMax}`
                  : active.targetReps}
              {active.restSec != null ? ` · rest ${active.restSec}s` : ""}
            </p>
          ) : (
            <p className="set-target">Added to this session</p>
          )}
          {active.note && <p className="set-note">{active.note}</p>}

          {w && (
            <>
              <div className="numbers">
                {active.kind === "weighted" ? (
                  <>
                    <div className="weight">
                      <button className="step" aria-label="Decrease weight" onClick={() => setWorkFor(active.exerciseId, { weight: Math.max(0, w.weight - 5) })}>
                        −
                      </button>
                      <div className="bignum">
                        <span className="wval">{w.weight}</span>
                        <span className="unit">lb</span>
                      </div>
                      <button className="step" aria-label="Increase weight" onClick={() => setWorkFor(active.exerciseId, { weight: w.weight + 5 })}>
                        +
                      </button>
                    </div>
                    <div className="reps">
                      <div className="repnum">×{w.reps}</div>
                      <div className="rlabel">reps</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "center" }}>
                        <button className="step small" aria-label="Fewer reps" onClick={() => setWorkFor(active.exerciseId, { reps: Math.max(1, w.reps - 1) })}>
                          −
                        </button>
                        <button className="step small" aria-label="More reps" onClick={() => setWorkFor(active.exerciseId, { reps: w.reps + 1 })}>
                          +
                        </button>
                      </div>
                    </div>
                  </>
                ) : active.kind === "reps" ? (
                  <div className="weight" style={{ justifyContent: "center" }}>
                    <button className="step" aria-label="Fewer reps" onClick={() => setWorkFor(active.exerciseId, { reps: Math.max(1, w.reps - 1) })}>
                      −
                    </button>
                    <div className="bignum">
                      <span className="wval">{w.reps}</span>
                      <span className="unit">reps</span>
                    </div>
                    <button className="step" aria-label="More reps" onClick={() => setWorkFor(active.exerciseId, { reps: w.reps + 1 })}>
                      +
                    </button>
                  </div>
                ) : (
                  <div className="weight" style={{ justifyContent: "center" }}>
                    <button className="step" aria-label="Less time" onClick={() => setWorkFor(active.exerciseId, { durationSec: Math.max(5, w.durationSec - 5) })}>
                      −
                    </button>
                    <div className="bignum">
                      <span className="wval">{fmtDur(w.durationSec)}</span>
                    </div>
                    <button className="step" aria-label="More time" onClick={() => setWorkFor(active.exerciseId, { durationSec: w.durationSec + 5 })}>
                      +
                    </button>
                  </div>
                )}
              </div>

              <div className={`delta${delta === null ? " flat" : delta > 0 ? "" : delta < 0 ? " down" : " flat"}`}>
                {delta === null
                  ? "First time logging this"
                  : delta > 0
                    ? `↑ +${delta} ${deltaUnit} vs last time`
                    : delta < 0
                      ? `↓ ${delta} ${deltaUnit} vs last time`
                      : "= same as last time"}
              </div>

              <div className="pips">
                {Array.from({ length: pipCount }).map((_, i) => {
                  const cls = ["pip"];
                  if (active.fromProgram && i >= active.targetSets) cls.push("extra");
                  if (i < active.loggedSets.length) cls.push("done");
                  else if (i === active.loggedSets.length) cls.push("active");
                  return <span key={i} className={cls.join(" ")} onClick={() => i === active.loggedSets.length && completeSet()} />;
                })}
              </div>
              <div className="warmup-row">
                <button
                  type="button"
                  className={`ls${nextIsWarmup ? " on" : ""}`}
                  aria-pressed={nextIsWarmup}
                  onClick={() => setNextIsWarmup((v) => !v)}
                >
                  Warm-up
                </button>
              </div>
              <button className="log" onClick={completeSet} disabled={logSet.isPending}>
                {logSet.isPending ? "Logging…" : `Complete set ${active.loggedSets.length + 1}`}
              </button>
            </>
          )}

          {active.loggedSets.length > 0 && (
            <div className="logged">
              <p className="eyebrow">Logged sets · tap to fix or remove</p>
              <ul>
                {active.loggedSets.map((s) => (
                  <li key={s.id} className="logged-set">
                    <span className="ls-num">{s.setNumber}</span>
                    <div className="ls-edit">
                      {active.kind === "weighted" ? (
                        <>
                          <button aria-label="Less weight" onClick={() => editSet.mutate({ setId: s.id, patch: { weight: Math.max(0, s.weight - 5) } })}>
                            −
                          </button>
                          <b>{s.weight}</b>
                          <span className="u">lb</span>
                          <button aria-label="More weight" onClick={() => editSet.mutate({ setId: s.id, patch: { weight: s.weight + 5 } })}>
                            +
                          </button>
                          <span className="x">×</span>
                          <button aria-label="Fewer reps" onClick={() => editSet.mutate({ setId: s.id, patch: { reps: Math.max(1, s.reps - 1) } })}>
                            −
                          </button>
                          <b>{s.reps}</b>
                          <button aria-label="More reps" onClick={() => editSet.mutate({ setId: s.id, patch: { reps: s.reps + 1 } })}>
                            +
                          </button>
                        </>
                      ) : active.kind === "reps" ? (
                        <>
                          <button aria-label="Fewer reps" onClick={() => editSet.mutate({ setId: s.id, patch: { reps: Math.max(1, s.reps - 1) } })}>
                            −
                          </button>
                          <b>{s.reps}</b>
                          <span className="u">reps</span>
                          <button aria-label="More reps" onClick={() => editSet.mutate({ setId: s.id, patch: { reps: s.reps + 1 } })}>
                            +
                          </button>
                        </>
                      ) : (
                        <>
                          <button aria-label="Less time" onClick={() => editSet.mutate({ setId: s.id, patch: { durationSec: Math.max(5, s.durationSec - 5) } })}>
                            −
                          </button>
                          <b>{fmtDur(s.durationSec)}</b>
                          <button aria-label="More time" onClick={() => editSet.mutate({ setId: s.id, patch: { durationSec: s.durationSec + 5 } })}>
                            +
                          </button>
                        </>
                      )}
                      <button
                        className={`ls-warmup-btn${s.isWarmup ? " on" : ""}`}
                        aria-label={s.isWarmup ? "Mark as working set" : "Mark as warm-up"}
                        aria-pressed={s.isWarmup}
                        onClick={() => editSet.mutate({ setId: s.id, patch: { isWarmup: !s.isWarmup } })}
                      >
                        W
                      </button>
                    </div>
                    {s.isWarmup && (
                      <span className="ls-warmup-tag" title="Warm-up set">
                        W
                      </span>
                    )}
                    {prSets.has(s.id) && (
                      <span className="ls-pr" title="Personal record">
                        🏆
                      </span>
                    )}
                    <button className="ls-del" aria-label="Remove set" onClick={() => deleteSet.mutate(s.id)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : exercises.length === 0 ? (
        <section className="empty-state">
          <h2>This day has no exercises yet</h2>
          <p>Add lifts to this day in your program, then come back here to log them.</p>
          <Link className="btn" to="/program">
            Edit program
          </Link>
        </section>
      ) : (
        <div className="setcard">
          <p className="eyebrow">Session</p>
          <h2 className="lift">All sets logged — nice work. 💪</h2>
          <div className="delta">Great session. Pick your next day whenever you’re ready.</div>
          <div className="done-actions">
            {data.session && (
              <Link className="log" to="/history/$sessionId" params={{ sessionId: data.session.id }}>
                Review session ›
              </Link>
            )}
            <Link to="/" className="back-link">
              ‹ All days
            </Link>
          </div>
        </div>
      )}

      {(data.day.warmup || data.day.cooldown) && (
        <div className="day-notes">
          {data.day.warmup && (
            <div>
              <p className="eyebrow section-eyebrow">Warm-up</p>
              <p className="day-note-text">{data.day.warmup}</p>
            </div>
          )}
          {data.day.cooldown && (
            <div>
              <p className="eyebrow section-eyebrow">Cool-down</p>
              <p className="day-note-text">{data.day.cooldown}</p>
            </div>
          )}
        </div>
      )}

      <div className="lifts">
        <p className="eyebrow section-eyebrow">This day</p>
        <ul>
          {programExercises.flatMap((e, i, list) => {
            const prev = list[i - 1];
            const next = list[i + 1];
            const g = e.supersetGroup;
            const inSS = !!g && (prev?.supersetGroup === g || next?.supersetGroup === g);
            const ssStart = inSS && prev?.supersetGroup !== g;
            const showSection = i === 0 || prev?.section !== e.section;
            const done = isExerciseDone(e);
            return [
              showSection ? (
                <li key={`sec-${e.exerciseId}`} className="pex-section">
                  {e.section || "Exercises"}
                </li>
              ) : null,
              ssStart ? (
                <li key={`ss-${e.exerciseId}`} className="ss-head">
                  Superset {g}
                </li>
              ) : null,
              <li key={e.exerciseId} className={inSS ? "in-ss" : undefined}>
                <button className={`row${done ? " is-done" : ""}${e.exerciseId === activeId ? " is-active" : ""}`} onClick={() => focusExercise(e.exerciseId)}>
                  <span className="mark">{done ? "✓" : ""}</span>
                  <span className="rname">{e.name}</span>
                  <span className="rmeta">
                    {rowMeta(e)} · <b>{e.loggedSets.length}</b>/{e.targetSets}
                  </span>
                </button>
              </li>,
            ];
          })}
        </ul>
      </div>

      {addedExercises.length > 0 && (
        <div className="lifts">
          <p className="eyebrow section-eyebrow">Added this session</p>
          <ul>
            {addedExercises.map((e) => (
              <li key={e.exerciseId}>
                <button className={`row${e.exerciseId === activeId ? " is-active" : ""}`} onClick={() => focusExercise(e.exerciseId)}>
                  <span className="mark" />
                  <span className="rname">{e.name}</span>
                  <span className="rmeta">
                    {rowMeta(e)} · <b>{e.loggedSets.length}</b> {e.loggedSets.length === 1 ? "set" : "sets"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="add-ex">
        {showAdd ? (
          <div className="add-ex-panel">
            <div className="add-ex-head">
              <p className="eyebrow">Add to this session</p>
              <button className="add-ex-close" onClick={() => setShowAdd(false)}>
                Close
              </button>
            </div>
            {library.length > 0 && (
              <div className="ex-suggest">
                {library.map((ex) => (
                  <button key={ex.id} onClick={() => addExercise(ex)}>
                    {ex.name}
                    <span className="kind-tag">{ex.kind}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="add-ex-new">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New exercise name"
                onKeyDown={(e) => e.key === "Enter" && createAndAdd()}
              />
              <div className="seg">
                {(["weighted", "reps", "time"] as const).map((k) => (
                  <button key={k} className={newKind === k ? "on" : ""} onClick={() => setNewKind(k)}>
                    {k}
                  </button>
                ))}
              </div>
              <button className="add-ex-create" disabled={!newName.trim() || createEx.isPending} onClick={createAndAdd}>
                {createEx.isPending ? "…" : "Add"}
              </button>
            </div>
          </div>
        ) : (
          <button className="add-ex-open" onClick={() => setShowAdd(true)}>
            ＋ Add an exercise
          </button>
        )}
      </div>

      {active && data.session && (
        <Link className="review-session" to="/history/$sessionId" params={{ sessionId: data.session.id }}>
          Review session <span aria-hidden="true">›</span>
        </Link>
      )}
    </>
  );
}
