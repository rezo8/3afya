import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { LogSetBody, TodayExercise, TodayResponse } from "@afya/shared";
import { api } from "@/lib/api/client";
import { FuelPanel } from "./FuelPanel";

type Work = Record<string, { weight: number; reps: number; durationSec: number }>;

const fmtDur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

export function TodayScreen() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["today"],
    queryFn: () => api.get<TodayResponse>("/api/sessions/today"),
  });
  const [work, setWork] = useState<Work>({});
  const [override, setOverride] = useState<string | null>(null);

  // Seed each exercise's working numbers from its last session (or its target).
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

  const logSet = useMutation({
    mutationFn: async (body: LogSetBody) => {
      let sid = data?.session?.id;
      if (!sid) sid = (await api.post<{ id: string }>("/api/sessions", {})).id;
      return api.post(`/api/sessions/${sid}/sets`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["today"] }),
  });

  if (isLoading) return <p className="center-note">Loading today…</p>;

  if (!data || !data.day) {
    return (
      <section className="empty-state">
        <h2>No program yet</h2>
        <p>Build your rotation in the Program tab — your next session shows up here.</p>
        <Link className="btn" to="/program">
          Build a program
        </Link>
      </section>
    );
  }

  const exercises = data.exercises;
  const isDone = (e: TodayExercise) => e.loggedSets.length >= e.targetSets;
  const doneCount = exercises.filter(isDone).length;
  const activeId =
    override && exercises.some((e) => e.exerciseId === override && !isDone(e))
      ? override
      : (exercises.find((e) => !isDone(e))?.exerciseId ?? null);
  const active = exercises.find((e) => e.exerciseId === activeId) ?? null;

  const setWorkFor = (id: string, patch: Partial<Work[string]>) =>
    setWork((wk) => ({ ...wk, [id]: { ...wk[id]!, ...patch } }));

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
  }

  const w = active ? work[active.exerciseId] : undefined;

  // Per-kind delta vs last time.
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
      <div className="today-head">
        <div>
          <p className="eyebrow">Today</p>
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

      {active && w ? (
        <div className="setcard">
          <p className="eyebrow">
            Now · set {active.loggedSets.length + 1} of {active.targetSets}
          </p>
          <h2 className="lift">{active.name}</h2>

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
        </div>
      ) : (
        <div className="setcard">
          <p className="eyebrow">Session</p>
          <h2 className="lift">All sets logged — nice work. 💪</h2>
          <div className="delta">Rest up. Your next rotation day is ready tomorrow.</div>
        </div>
      )}

      <div className="lifts">
        <p className="eyebrow section-eyebrow">Session</p>
        <ul>
          {exercises.map((e) => {
            const done = isDone(e);
            return (
              <li key={e.exerciseId}>
                <button
                  className={`row${done ? " is-done" : e.exerciseId === activeId ? " is-active" : ""}`}
                  onClick={() => !done && setOverride(e.exerciseId)}
                >
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

      <FuelPanel />
    </>
  );
}
