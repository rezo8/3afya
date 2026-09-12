import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type {
  CreateExerciseBody,
  DistanceUnit,
  Equipment,
  Exercise,
  ExerciseAlternative,
  LoggedSetResult,
  LogSetBody,
  MuscleGroup,
  PrKind,
  TodayExercise,
  TodayResponse,
  UpdateSetBody,
} from "@afya/shared";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { DraftInput } from "@/components/DraftInput";
import { SetEditor, stepDistance } from "@/components/SetEditor";
import { PR_LABEL } from "@/lib/pr";
import { fmtClock, fmtDist, fmtDur, parseDuration, stepDuration } from "@/lib/format";
import { isExerciseDone } from "@/lib/session";
import { useRestTimer } from "./RestTimer";

type Work = Record<string, { weight: number; reps: number; durationSec: number; distance: number; distanceUnit: DistanceUnit }>;

/** A session either works through a program day, or is freeform: whatever was actually done. */
type SessionTarget = { kind: "day"; dayId: string } | { kind: "freeform" };

const DISTANCE_UNITS: DistanceUnit[] = ["mi", "km", "m"];


/** A plain decimal, or null while the text isn't one yet ("7." mid-keystroke). */
const parseNonNegative = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
};

const muscleLabel = (group: MuscleGroup) => group.replace("_", " ");

function TaxonomyTags({ muscleGroup, equipment }: { muscleGroup: MuscleGroup | null; equipment: Equipment | null }) {
  return (
    <>
      {muscleGroup && <span className="ex-tag">{muscleLabel(muscleGroup)}</span>}
      {equipment && <span className="ex-tag">{equipment}</span>}
    </>
  );
}

/** The entry card's headline control: − big value +, whatever the kind measures. */
function BigStep({
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
  centered,
  children,
}: {
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
  centered?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="weight" style={centered ? { justifyContent: "center" } : undefined}>
      <button className="step" aria-label={decreaseLabel} onClick={onDecrease}>
        −
      </button>
      <div className="bignum">{children}</div>
      <button className="step" aria-label={increaseLabel} onClick={onIncrease}>
        +
      </button>
    </div>
  );
}

/** A session against one day of the program. */
export function SessionScreen() {
  const { dayId } = useParams({ strict: false }) as { dayId?: string };
  if (!dayId) return <SessionNotFound />;
  return <SessionView target={{ kind: "day", dayId }} />;
}

/** A session belonging to no program day — a ride, a run, a class, anything. */
export function FreeformSessionScreen() {
  return <SessionView target={{ kind: "freeform" }} />;
}

function SessionNotFound() {
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

function SessionView({ target }: { target: SessionTarget }) {
  const qc = useQueryClient();
  // One key per target, so switching days (or into freeform) resets the screen's state.
  const targetKey = target.kind === "day" ? target.dayId : "freeform";
  const { data, isLoading } = useQuery({
    queryKey: ["session", targetKey],
    queryFn: () =>
      api.get<TodayResponse>(target.kind === "day" ? `/api/sessions/day/${target.dayId}` : "/api/sessions/freeform"),
  });
  const [work, setWork] = useState<Work>({});
  const [override, setOverride] = useState<string | null>(null);
  const [extras, setExtras] = useState<Exercise[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<Exercise["kind"]>("weighted");
  const [prBanner, setPrBanner] = useState<{ prs: PrKind[]; name: string } | null>(null);
  const [prSets, setPrSets] = useState<Set<string>>(new Set());
  const [mutError, setMutError] = useState<{ message: string; retry: () => void } | null>(null);
  const [nextIsWarmup, setNextIsWarmup] = useState(false);
  /**
   * The session `logSet` lazily created, held until an invalidated query reports it.
   * A failed set-POST doesn't invalidate, so without this a retry re-reads the same
   * still-empty `data.session` and issues another create call — which only avoids a
   * duplicate row because `POST /api/sessions` happens to be find-or-create.
   */
  const createdSessionId = useRef<string | null>(null);
  const rest = useRestTimer();
  const libraryQ = useQuery({ queryKey: ["exercises"], queryFn: () => api.get<Exercise[]>("/api/exercises") });
  const alternativesQ = useQuery({
    queryKey: ["alternatives", swapFor],
    queryFn: () => api.get<ExerciseAlternative[]>(`/api/exercises/${swapFor}/alternatives`),
    enabled: swapFor !== null,
  });

  useEffect(() => {
    setExtras([]);
    setShowAdd(false);
    setSwapFor(null);
    setOverride(null);
    setPrBanner(null);
    setPrSets(new Set());
    setMutError(null);
    setNextIsWarmup(false);
    createdSessionId.current = null;
  }, [targetKey]);

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
            distance: ex.lastDistance ?? 1,
            distanceUnit: ex.lastDistanceUnit ?? "mi",
          };
        }
      }
      return next;
    });
  }, [data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["session", targetKey] });
    qc.invalidateQueries({ queryKey: ["today"] });
  };
  const logSet = useMutation({
    mutationFn: async ({ body }: { body: LogSetBody; name: string }) => {
      let sid = data?.session?.id ?? createdSessionId.current;
      if (!sid) {
        const start = target.kind === "day" ? { dayId: target.dayId } : { freeform: true };
        sid = (await api.post<{ id: string }>("/api/sessions", start)).id;
        createdSessionId.current = sid;
      }
      return api.post<LoggedSetResult>(`/api/sessions/${sid}/sets`, body);
    },
    onSuccess: (result, vars) => {
      setMutError(null);
      setNextIsWarmup(false);
      createdSessionId.current = null;
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

  // A freeform session has no day by definition; a day session without one is gone.
  if (!data || (target.kind === "day" && !data.day)) return <SessionNotFound />;
  const day = data.day;

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
      lastDistance: null,
      lastDistanceUnit: null,
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
    setSwapFor(null);
  };
  const addExercise = (ex: Exercise) => {
    setExtras((xs) => (xs.some((x) => x.id === ex.id) ? xs : [...xs, ex]));
    setWork((wk) =>
      wk[ex.id] ? wk : { ...wk, [ex.id]: { weight: 45, reps: 8, durationSec: 30, distance: 1, distanceUnit: "mi" } },
    );
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
  const libraryById = new Map<string, Exercise>((libraryQ.data ?? []).map((ex) => [ex.id, ex]));

  const openAdd = () => {
    setShowAdd(true);
    setSwapFor(null);
  };
  /** The muscle group lives on the library `Exercise`, never on the session's `TodayExercise`. */
  const canSwap = active !== null && libraryById.get(active.exerciseId)?.primaryMuscleGroup != null;
  const swapOpen = active !== null && swapFor === active.exerciseId;
  const alternatives = alternativesQ.data ?? [];
  const toggleSwap = (exerciseId: string) => {
    setSwapFor(swapOpen ? null : exerciseId);
    setShowAdd(false);
  };
  /**
   * A substitute is performed-side only: it joins this session as an ad-hoc exercise and
   * the program day keeps the exercise it planned.
   */
  const swapTo = async (alt: ExerciseAlternative) => {
    if (alt.id === null) {
      try {
        // No `kind` on purpose — the server takes it (and the muscle tags) from the catalog.
        addExercise(await createEx.mutateAsync({ name: alt.name }));
      } catch {
        // onError above already surfaced the banner; nothing else to do here.
      }
      return;
    }
    if (inSession.has(alt.id)) {
      focusExercise(alt.id);
      return;
    }
    const fromLibrary = libraryById.get(alt.id);
    if (fromLibrary) addExercise(fromLibrary);
  };

  const setWorkFor = (id: string, patch: Partial<Work[string]>) => setWork((wk) => ({ ...wk, [id]: { ...wk[id]!, ...patch } }));

  const stepDistanceBy = (direction: 1 | -1) => {
    if (!active || !w) return;
    setWorkFor(active.exerciseId, { distance: stepDistance(w.distance, w.distanceUnit, direction) });
  };

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
    } else if (active.kind === "distance") {
      body.distance = wk.distance;
      body.distanceUnit = wk.distanceUnit;
      // Timing a ride is optional — send a duration only when one was actually dialled in.
      if (wk.durationSec > 0) body.durationSec = wk.durationSec;
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
    } else if (active.kind === "distance" && active.lastDistance != null && active.lastDistanceUnit === w.distanceUnit) {
      // Only comparable in the same unit — a cross-unit comparison is left unsaid
      // rather than converted behind the user's back.
      delta = +(w.distance - active.lastDistance).toFixed(2);
      deltaUnit = w.distanceUnit;
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
    if (e.kind === "distance") {
      const unit = ew?.distanceUnit ?? e.lastDistanceUnit ?? "mi";
      const dist = ew ? ew.distance : (e.lastDistance ?? 0);
      return <b>{fmtDist(dist, unit)}</b>;
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
          <p className="eyebrow">{day ? "Session" : "Freeform"}</p>
          <h1 className="day">{day ? day.name : "Anything else"}</h1>
        </div>
        {day && (
          <div className="session-progress">
            <span className="frac num">
              <b>{doneCount}</b>/{exercises.length}
            </span>
            <span className="lbl">lifts</span>
          </div>
        )}
      </div>
      {day && (
        <div className="track">
          <i style={{ width: `${exercises.length ? (doneCount / exercises.length) * 100 : 0}%` }} />
        </div>
      )}

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

          {canSwap && (
            <div className="swap-row">
              <button
                type="button"
                className={`ls${swapOpen ? " on" : ""}`}
                aria-expanded={swapOpen}
                onClick={() => toggleSwap(active.exerciseId)}
              >
                Swap ⇄
              </button>
            </div>
          )}
          {swapOpen && (
            <div className="swap-panel">
              <div className="add-ex-head">
                <p className="eyebrow">Swap for</p>
                <button className="add-ex-close" onClick={() => setSwapFor(null)}>
                  Close
                </button>
              </div>
              {alternativesQ.isLoading ? (
                <p className="swap-note">Finding alternatives…</p>
              ) : alternativesQ.isError ? (
                <ErrorBanner message={errorMessage(alternativesQ.error)} onRetry={() => alternativesQ.refetch()} />
              ) : alternatives.length === 0 ? (
                <p className="swap-note">No alternatives for this one</p>
              ) : (
                <ul className="swap-list">
                  {alternatives.map((alt) => (
                    <li key={alt.id ?? alt.name}>
                      <button onClick={() => swapTo(alt)} disabled={createEx.isPending}>
                        <span className="swap-name">{alt.name}</span>
                        <span className="swap-tags">
                          <TaxonomyTags muscleGroup={alt.primaryMuscleGroup} equipment={alt.equipment} />
                          {!alt.inLibrary && <span className="swap-new">new</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {w && (
            <>
              <div className="numbers">
                {active.kind === "weighted" ? (
                  <>
                    <BigStep
                      decreaseLabel="Decrease weight"
                      increaseLabel="Increase weight"
                      onDecrease={() => setWorkFor(active.exerciseId, { weight: Math.max(0, w.weight - 5) })}
                      onIncrease={() => setWorkFor(active.exerciseId, { weight: w.weight + 5 })}
                    >
                      <span className="wval">{w.weight}</span>
                      <span className="unit">lb</span>
                    </BigStep>
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
                  <BigStep
                    centered
                    decreaseLabel="Fewer reps"
                    increaseLabel="More reps"
                    onDecrease={() => setWorkFor(active.exerciseId, { reps: Math.max(1, w.reps - 1) })}
                    onIncrease={() => setWorkFor(active.exerciseId, { reps: w.reps + 1 })}
                  >
                    <span className="wval">{w.reps}</span>
                    <span className="unit">reps</span>
                  </BigStep>
                ) : active.kind === "distance" ? (
                  <div className="dist">
                    <BigStep
                      centered
                      decreaseLabel="Shorter distance"
                      increaseLabel="Longer distance"
                      onDecrease={() => stepDistanceBy(-1)}
                      onIncrease={() => stepDistanceBy(1)}
                    >
                      <DraftInput
                        key={active.exerciseId}
                        className="dist-input"
                        ariaLabel="Distance"
                        value={w.distance}
                        format={String}
                        parse={parseNonNegative}
                        onChange={(distance) => setWorkFor(active.exerciseId, { distance })}
                      />
                      <span className="unit">{w.distanceUnit}</span>
                    </BigStep>
                    <div className="seg dist-units">
                      {DISTANCE_UNITS.map((u) => (
                        <button
                          key={u}
                          className={w.distanceUnit === u ? "on" : ""}
                          onClick={() => setWorkFor(active.exerciseId, { distanceUnit: u })}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                    <div className="dist-time">
                      <span className="rlabel">time · h:mm:ss</span>
                      <button className="step small" aria-label="Less time" onClick={() => setWorkFor(active.exerciseId, { durationSec: stepDuration(w.durationSec, -1) })}>
                        −
                      </button>
                      <DraftInput
                        key={active.exerciseId}
                        className="ls-time-in"
                        ariaLabel="Time"
                        value={w.durationSec}
                        format={fmtClock}
                        parse={parseDuration}
                        onChange={(durationSec) => setWorkFor(active.exerciseId, { durationSec })}
                      />
                      <button className="step small" aria-label="More time" onClick={() => setWorkFor(active.exerciseId, { durationSec: stepDuration(w.durationSec, 1) })}>
                        +
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="dist">
                    <BigStep
                      centered
                      decreaseLabel="Less time"
                      increaseLabel="More time"
                      onDecrease={() => setWorkFor(active.exerciseId, { durationSec: stepDuration(w.durationSec, -1) })}
                      onIncrease={() => setWorkFor(active.exerciseId, { durationSec: stepDuration(w.durationSec, 1) })}
                    >
                      <DraftInput
                        key={active.exerciseId}
                        className="dist-input time-input"
                        ariaLabel="Time"
                        value={w.durationSec}
                        format={fmtClock}
                        parse={parseDuration}
                        onChange={(durationSec) => setWorkFor(active.exerciseId, { durationSec })}
                      />
                    </BigStep>
                    <span className="rlabel">type 45s · 12:30 · 1:05:00</span>
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
                    <SetEditor kind={active.kind} set={s} onPatch={(patch) => editSet.mutate({ setId: s.id, patch })} />
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
        day ? (
          <section className="empty-state">
            <h2>This day has no exercises yet</h2>
            <p>Add lifts to this day in your program, then come back here to log them.</p>
            <Link className="btn" to="/program">
              Edit program
            </Link>
          </section>
        ) : (
          <section className="empty-state">
            <h2>Nothing logged yet</h2>
            <p>Add whatever you did — a ride, a run, a class, a set of push-ups — and log it below.</p>
          </section>
        )
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

      {day && (day.warmup || day.cooldown) && (
        <div className="day-notes">
          {day.warmup && (
            <div>
              <p className="eyebrow section-eyebrow">Warm-up</p>
              <p className="day-note-text">{day.warmup}</p>
            </div>
          )}
          {day.cooldown && (
            <div>
              <p className="eyebrow section-eyebrow">Cool-down</p>
              <p className="day-note-text">{day.cooldown}</p>
            </div>
          )}
        </div>
      )}

      {programExercises.length > 0 && (
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
      )}

      {addedExercises.length > 0 && (
        <div className="lifts">
          <p className="eyebrow section-eyebrow">{day ? "Added this session" : "Logged this session"}</p>
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
              <p className="eyebrow">{day ? "Add to this session" : "What did you do?"}</p>
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
                    <TaxonomyTags muscleGroup={ex.primaryMuscleGroup} equipment={ex.equipment} />
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
                {(["weighted", "reps", "time", "distance"] as const).map((k) => (
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
          <button className="add-ex-open" onClick={openAdd}>
            {day ? "＋ Add an exercise" : "＋ Add what you did"}
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
