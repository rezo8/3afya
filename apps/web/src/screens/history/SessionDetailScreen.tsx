import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import type { SessionDetail, SessionExercise, SetLog, UpdateSetBody } from "@afya/shared";
import { SetEditor } from "@/components/SetEditor";
import { ErrorBanner } from "@/components/ErrorBanner";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { fmtDist, fmtDur } from "@/lib/format";

/** Matches ProgramScreen's "Delete day" arming window — same guard, same feel. */
const DELETE_ARM_MS = 4000;

const est1rm = (s: SetLog) => s.weight * (1 + s.reps / 30);

/**
 * Distance sets are summed only within one unit — the unit of the session's first such
 * set. Mixing units in one session is rare enough that showing the sets rather than a
 * converted total is the honest answer.
 */
function distanceTotal(e: SessionExercise): string {
  const unit = e.sets.find((s) => s.distanceUnit)?.distanceUnit;
  if (!unit) return `${e.sets.length} logged`;
  const total = e.sets.filter((s) => s.distanceUnit === unit).reduce((n, s) => n + s.distance, 0);
  return fmtDist(total, unit);
}

function exerciseTotal(e: SessionExercise): string {
  if (e.kind === "weighted") return `${Math.round(e.sets.reduce((n, s) => n + s.weight * s.reps, 0)).toLocaleString()} lb`;
  if (e.kind === "reps") return `${e.sets.reduce((n, s) => n + s.reps, 0)} reps`;
  if (e.kind === "distance") return distanceTotal(e);
  return fmtDur(e.sets.reduce((n, s) => n + s.durationSec, 0));
}

function bestSetIndex(e: SessionExercise): number {
  const score = (s: SetLog) =>
    e.kind === "weighted" ? est1rm(s) : e.kind === "reps" ? s.reps : e.kind === "distance" ? s.distance : s.durationSec;
  let best = -1;
  let bestScore = -Infinity;
  e.sets.forEach((s, i) => {
    if (s.isWarmup) return;
    const v = score(s);
    if (v > bestScore) {
      bestScore = v;
      best = i;
    }
  });
  return best;
}

function setValue(e: SessionExercise, s: SetLog) {
  if (e.kind === "weighted")
    return (
      <>
        <b>{s.weight}</b> lb × <b>{s.reps}</b>
      </>
    );
  if (e.kind === "reps")
    return (
      <>
        <b>{s.reps}</b> reps
      </>
    );
  if (e.kind === "distance")
    return (
      <>
        <b>{fmtDist(s.distance, s.distanceUnit ?? "mi")}</b>
        {s.durationSec > 0 ? <> · {fmtDur(s.durationSec)}</> : null}
      </>
    );
  return <b>{fmtDur(s.durationSec)}</b>;
}

export function SessionDetailScreen() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const { data, isLoading } = useQuery({
    queryKey: ["session-detail", sessionId],
    queryFn: () => api.get<SessionDetail>(`/api/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
  const [armedRemove, setArmedRemove] = useState(false);
  /** Editing is opt-in, one exercise at a time: this screen is a recap first. */
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!armedRemove) return;
    const t = setTimeout(() => setArmedRemove(false), DELETE_ARM_MS);
    return () => clearTimeout(t);
  }, [armedRemove]);

  /** A set logged into any session is corrected the same way, so every view of it refreshes. */
  const invalidateSets = () => {
    qc.invalidateQueries({ queryKey: ["session-detail", sessionId] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["session"] });
    qc.invalidateQueries({ queryKey: ["today"] });
    qc.invalidateQueries({ queryKey: ["records"] });
    qc.invalidateQueries({ queryKey: ["trends"] });
  };
  const editSet = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: UpdateSetBody }) =>
      api.patch(`/api/sessions/${sessionId}/sets/${setId}`, patch),
    onSuccess: invalidateSets,
  });
  const deleteSet = useMutation({
    mutationFn: (setId: string) => api.delete(`/api/sessions/${sessionId}/sets/${setId}`),
    onSuccess: invalidateSets,
  });

  const removeSession = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sessions/${id}`),
    onSuccess: () => {
      setArmedRemove(false);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["session"] });
      qc.invalidateQueries({ queryKey: ["today"] });
      navigate({ to: "/history" });
    },
  });

  if (isLoading) return <p className="center-note">Loading session…</p>;
  if (!data) {
    return (
      <section className="empty-state">
        <h2>Session not found</h2>
        <p>It may have been removed.</p>
        <Link className="btn" to="/history">
          Back to history
        </Link>
      </section>
    );
  }

  const when = new Date(data.performedAt);
  const totalSets = data.exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = Math.round(data.exercises.reduce((n, e) => n + e.sets.reduce((v, s) => v + s.weight * s.reps, 0), 0));
  const recordSetIds = new Set((data.records ?? []).flatMap((r) => r.records.map((x) => x.setId)));
  const prSetCount = data.exercises.reduce((n, e) => n + e.sets.filter((s) => recordSetIds.has(s.id)).length, 0);
  const prExerciseNames = data.exercises.filter((e) => e.sets.some((s) => recordSetIds.has(s.id))).map((e) => e.name);

  return (
    <>
      <Link to="/history" className="back-link">
        ‹ History
      </Link>
      <div className="view-head">
        <p className="eyebrow">{when.toLocaleDateString("en-US", { weekday: "long" })}</p>
        <h1>{data.dayName ?? "Freeform"}</h1>
      </div>
      <p className="sd-sub">{when.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      {prSetCount > 0 && (
        <div className="pr-banner">
          <span className="pr-trophy">🏆</span>
          <span className="pr-text">
            <b>
              {prSetCount} {prSetCount === 1 ? "PR" : "PRs"}
            </b>{" "}
            · {prExerciseNames.join(" · ")}
          </span>
        </div>
      )}
      {data.note && <p className="sd-note">{data.note}</p>}

      <div className="stat-row">
        <div className="stat">
          <div className="v">{data.exercises.length}</div>
          <span className="k">Exercises</span>
        </div>
        <div className="stat">
          <div className="v">{totalSets}</div>
          <span className="k">Sets</span>
        </div>
        <div className="stat">
          <div className="v">
            {volume.toLocaleString()}
            <span className="u">lb</span>
          </div>
          <span className="k">Volume</span>
        </div>
      </div>

      {(editSet.isError || deleteSet.isError) && (
        <ErrorBanner message={errorMessage(editSet.error ?? deleteSet.error)} onRetry={() => invalidateSets()} />
      )}

      {data.exercises.length === 0 ? (
        <section className="sd-empty">
          <p className="center-note">No sets were logged in this session.</p>
          {removeSession.isError && (
            <ErrorBanner message={errorMessage(removeSession.error)} onRetry={() => removeSession.mutate(data.id)} />
          )}
          {armedRemove ? (
            <button className="sd-remove armed" disabled={removeSession.isPending} onClick={() => removeSession.mutate(data.id)}>
              Tap again to remove this empty session · this can’t be undone
            </button>
          ) : (
            <button className="sd-remove" onClick={() => setArmedRemove(true)}>
              Remove this session
            </button>
          )}
        </section>
      ) : (
        <ul className="sd-ex-list">
          {data.exercises.map((e) => {
            const best = bestSetIndex(e);
            return (
              <li key={e.exerciseId} className="sd-ex">
                <div className="sd-ex-head">
                  <span className="sd-ex-name">
                    {e.name}
                    <span className="kind-tag">{e.kind}</span>
                    {!e.fromProgram && <span className="adhoc-tag">added</span>}
                  </span>
                  <span className="sd-total">{exerciseTotal(e)}</span>
                </div>
                <div className="sd-ex-actions">
                  <button
                    type="button"
                    className={`ls${editing === e.exerciseId ? " on" : ""}`}
                    aria-pressed={editing === e.exerciseId}
                    onClick={() => setEditing(editing === e.exerciseId ? null : e.exerciseId)}
                  >
                    {editing === e.exerciseId ? "Done" : "Edit sets"}
                  </button>
                </div>
                <ul className="sd-sets">
                  {e.sets.map((s, i) => {
                    const isPr = recordSetIds.has(s.id);
                    return (
                      <li key={s.id} className={`sd-set${isPr ? " pr" : i === best ? " best" : ""}`}>
                        <span className="sd-set-n">{s.setNumber}</span>
                        {editing === e.exerciseId ? (
                          <>
                            <SetEditor kind={e.kind} set={s} onPatch={(patch) => editSet.mutate({ setId: s.id, patch })} />
                            <button className="ls-del" aria-label="Remove set" onClick={() => deleteSet.mutate(s.id)}>
                              ×
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="sd-set-v">{setValue(e, s)}</span>
                            {s.isWarmup && (
                              <span className="ls-warmup-tag" title="Warm-up set">
                                W
                              </span>
                            )}
                            {isPr ? (
                              <span className="sd-pr-tag">🏆 PR</span>
                            ) : (
                              i === best && e.sets.length > 1 && <span className="sd-best-tag">best</span>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
