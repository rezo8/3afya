import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { LogSetBody, TodayExercise, TodayResponse, UpdateSetBody } from "@afya/shared";
import { api } from "@/lib/api/client";
import { RestBar, useRestTimer } from "./RestTimer";

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
  const rest = useRestTimer();

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
    mutationFn: async (body: LogSetBody) => {
      let sid = data?.session?.id;
      if (!sid) sid = (await api.post<{ id: string }>("/api/sessions", { dayId })).id;
      return api.post(`/api/sessions/${sid}/sets`, body);
    },
    onSuccess: invalidate,
  });
  const editSet = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: UpdateSetBody }) => api.patch(`/api/sessions/${data!.session!.id}/sets/${setId}`, patch),
    onSuccess: invalidate,
  });
  const deleteSet = useMutation({
    mutationFn: (setId: string) => api.delete(`/api/sessions/${data!.session!.id}/sets/${setId}`),
    onSuccess: invalidate,
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

  const exercises = data.exercises;
  const isDone = (e: TodayExercise) => e.loggedSets.length >= e.targetSets;
  const doneCount = exercises.filter(isDone).length;
  const activeId =
    override && exercises.some((e) => e.exerciseId === override)
      ? override
      : (exercises.find((e) => !isDone(e))?.exerciseId ?? null);
  const active = exercises.find((e) => e.exerciseId === activeId) ?? null;

  const setWorkFor = (id: string, patch: Partial<Work[string]>) => setWork((wk) => ({ ...wk, [id]: { ...wk[id]!, ...patch } }));

  function completeSet() {
    if (!active) return;
    const wk = work[active.exerciseId]!;
    const body: LogSetBody = { exerciseId: active.exerciseId, setNumber: active.loggedSets.length + 1 };
    if (active.kind === "weighted") {
      body.weight = wk.weight;
      body.reps = wk.reps;
    } else if (active.kind === "reps") {
      body.reps = wk.reps;
    } else {
      body.durationSec = wk.durationSec;
    }
    logSet.mutate(body);
    setOverride(null);
    rest.start(active.restSec ?? 90);
  }

  const w = active ? work[active.exerciseId] : undefined;
  const activeDone = active ? isDone(active) : false;

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

      {active ? (
        <div className="setcard">
          <p className="eyebrow">{activeDone ? "Done · edit below" : `Now · set ${active.loggedSets.length + 1} of ${active.targetSets}`}</p>
          <h2 className="lift">{active.name}</h2>
          <p className="set-target">
            {active.targetSets} ×{" "}
            {active.kind === "time"
              ? fmtDur(active.targetDurationSec ?? 0)
              : active.targetRepsMax
                ? `${active.targetReps}–${active.targetRepsMax}`
                : active.targetReps}
            {active.restSec != null ? ` · rest ${active.restSec}s` : ""}
          </p>
          {active.note && <p className="set-note">{active.note}</p>}

          {!activeDone && w && (
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
                {Array.from({ length: active.targetSets }).map((_, i) => (
                  <span
                    key={i}
                    className={`pip${i < active.loggedSets.length ? " done" : i === active.loggedSets.length ? " active" : ""}`}
                    onClick={() => i === active.loggedSets.length && completeSet()}
                  />
                ))}
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
                    </div>
                    <button className="ls-del" aria-label="Remove set" onClick={() => deleteSet.mutate(s.id)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="setcard">
          <p className="eyebrow">Session</p>
          <h2 className="lift">All sets logged — nice work. 💪</h2>
          <div className="delta">Great session. Pick your next day whenever you’re ready.</div>
          <Link className="log" to="/" style={{ textAlign: "center", textDecoration: "none" }}>
            Back to days
          </Link>
        </div>
      )}

      <div className="lifts">
        <p className="eyebrow section-eyebrow">This day</p>
        <ul>
          {exercises.map((e) => {
            const done = isDone(e);
            return (
              <li key={e.exerciseId}>
                <button className={`row${done ? " is-done" : ""}${e.exerciseId === activeId ? " is-active" : ""}`} onClick={() => setOverride(e.exerciseId)}>
                  <span className="mark">{done ? "✓" : ""}</span>
                  <span className="rname">{e.name}</span>
                  <span className="rmeta">
                    {rowMeta(e)} · <b>{e.loggedSets.length}</b>/{e.targetSets}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {rest.state && (
        <RestBar total={rest.state.total} endsAt={rest.state.endsAt} onAdjust={rest.adjust} onSkip={rest.skip} onDone={rest.onDone} />
      )}
    </>
  );
}
