import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { SessionDetail, SessionExercise, SetLog } from "@afya/shared";
import { api } from "@/lib/api/client";

const fmtDur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const est1rm = (s: SetLog) => s.weight * (1 + s.reps / 30);

function exerciseTotal(e: SessionExercise): string {
  if (e.kind === "weighted") return `${Math.round(e.sets.reduce((n, s) => n + s.weight * s.reps, 0)).toLocaleString()} lb`;
  if (e.kind === "reps") return `${e.sets.reduce((n, s) => n + s.reps, 0)} reps`;
  return fmtDur(e.sets.reduce((n, s) => n + s.durationSec, 0));
}

function bestSetIndex(e: SessionExercise): number {
  const score = (s: SetLog) => (e.kind === "weighted" ? est1rm(s) : e.kind === "reps" ? s.reps : s.durationSec);
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
  return <b>{fmtDur(s.durationSec)}</b>;
}

export function SessionDetailScreen() {
  const { sessionId } = useParams({ strict: false }) as { sessionId?: string };
  const { data, isLoading } = useQuery({
    queryKey: ["session-detail", sessionId],
    queryFn: () => api.get<SessionDetail>(`/api/sessions/${sessionId}`),
    enabled: !!sessionId,
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

      {data.exercises.length === 0 ? (
        <p className="center-note">No sets were logged in this session.</p>
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
                <ul className="sd-sets">
                  {e.sets.map((s, i) => {
                    const isPr = recordSetIds.has(s.id);
                    return (
                      <li key={s.id} className={`sd-set${isPr ? " pr" : i === best ? " best" : ""}`}>
                        <span className="sd-set-n">{s.setNumber}</span>
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
