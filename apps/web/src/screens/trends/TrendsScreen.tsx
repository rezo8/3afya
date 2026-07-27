import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExerciseRecords, FuelHistory, PrEntry, ProgressTrend, TrendExercise } from "@afya/shared";
import { api } from "@/lib/api/client";
import { PR_LABEL } from "@/lib/pr";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
const fmtDur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

const RECENT_RECORDS = 3;
const VISIBLE_LIFT_CHIPS = 8;

const METRIC_LABEL: Record<ProgressTrend["metric"], string> = {
  est1rm: "Estimated 1RM",
  reps: "Best set",
  time: "Best hold",
};

const fmtRecord = (r: PrEntry) => {
  if (r.kind === "duration") return fmtDur(r.value);
  if (r.kind === "reps") return `${r.value} reps`;
  if (r.kind === "weight") return `${r.value} lb`;
  return `${Math.round(r.value).toLocaleString()} lb`;
};

const describeAdherence = (onTarget: number, logged: number) =>
  logged === 0 ? "no days logged" : `${onTarget} of ${logged} logged day${logged === 1 ? "" : "s"} on target`;

/** The newest PRs across every exercise, regrouped by exercise so one list shape renders both states. */
function newestRecords(all: ExerciseRecords[]): ExerciseRecords[] {
  const newest = all
    .flatMap((ex) => ex.records.map((record) => ({ ex, record })))
    .sort((a, b) => Date.parse(b.record.achievedAt) - Date.parse(a.record.achievedAt))
    .slice(0, RECENT_RECORDS);

  const byExercise = new Map<string, ExerciseRecords>();
  for (const { ex, record } of newest) {
    const group = byExercise.get(ex.exerciseId);
    if (group) group.records.push(record);
    else byExercise.set(ex.exerciseId, { ...ex, records: [record] });
  }
  return [...byExercise.values()];
}

export function TrendsScreen() {
  const exQ = useQuery({
    queryKey: ["trends", "exercises"],
    queryFn: () => api.get<TrendExercise[]>("/api/trends/exercises"),
  });
  const [liftId, setLiftId] = useState<string | null>(null);
  useEffect(() => {
    if (!liftId && exQ.data?.[0]) setLiftId(exQ.data[0].id);
  }, [exQ.data, liftId]);

  const progQ = useQuery({
    queryKey: ["trends", "progress", liftId],
    queryFn: () => api.get<ProgressTrend>(`/api/trends/progress?exerciseId=${liftId}`),
    enabled: !!liftId,
  });
  const fuelQ = useQuery({
    queryKey: ["fuel", "history"],
    queryFn: () => api.get<FuelHistory>("/api/fuel/history?days=7"),
  });
  const recordsQ = useQuery({
    queryKey: ["records"],
    queryFn: () => api.get<ExerciseRecords[]>("/api/records"),
  });

  const [progReadout, setProgReadout] = useState<string | null>(null);
  const [fuelReadout, setFuelReadout] = useState<string | null>(null);
  const [fuelKind, setFuelKind] = useState<"protein" | "cal">("protein");
  const [allLiftsShown, setAllLiftsShown] = useState(false);
  const [allRecordsShown, setAllRecordsShown] = useState(false);

  const prog = progQ.data;
  const isTime = prog?.metric === "time";
  const unit = prog?.unit ?? "";
  const fmtVal = (v: number) => (isTime ? fmtDur(v) : `${v} ${unit}`);
  const progVals = prog?.points.map((p) => p.value) ?? [];
  const progLabels = prog?.points.map((p) => shortDate(p.date)) ?? [];
  const progNow = progVals.at(-1);
  const progDelta = progVals.length > 1 ? progNow! - progVals[0]! : 0;

  const lifts = exQ.data ?? [];
  const selectedLift = lifts.find((e) => e.id === liftId);
  const orderedLifts = selectedLift ? [selectedLift, ...lifts.filter((e) => e.id !== selectedLift.id)] : lifts;
  const visibleLifts = allLiftsShown ? orderedLifts : orderedLifts.slice(0, VISIBLE_LIFT_CHIPS);

  const fuel = fuelQ.data;
  const fuelDays = fuel?.days ?? [];
  const fuelVals = fuelDays.map((d) => {
    if (d.entryCount === 0) return null;
    return fuelKind === "protein" ? Math.round(d.proteinG) : Math.round(d.calories);
  });
  const fuelLabels = fuelDays.map((d) => weekday(d.date));
  const fuelGoal = fuel ? (fuelKind === "protein" ? fuel.target.proteinG : fuel.target.calories) : 0;
  const fuelUnit = fuelKind === "protein" ? "g" : "kcal";
  const loggedDays = fuelVals.filter((v) => v !== null).length;
  const onTargetDays = fuelVals.filter((v) => v !== null && v >= fuelGoal).length;
  const adherence = fuel ? describeAdherence(onTargetDays, loggedDays) : "—";

  const records = recordsQ.data ?? [];
  const recordCount = records.reduce((n, ex) => n + ex.records.length, 0);
  const shownRecords = allRecordsShown ? records : newestRecords(records);

  if (exQ.isLoading) return <p className="center-note">Loading trends…</p>;

  return (
    <>
      <div className="view-head">
        <p className="eyebrow">Trends</p>
        <h1>Progress</h1>
      </div>

      {exQ.data && exQ.data.length === 0 ? (
        <section className="empty-state">
          <h2>No trends yet</h2>
          <p>Log a few sessions and your progress, bodyweight, and fuel adherence show up here.</p>
        </section>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <p className="eyebrow">{prog ? METRIC_LABEL[prog.metric] : "Progress"}</p>
              <span className="readout">
                {progReadout ?? (progNow != null && prog ? `${prog.name} · ${fmtVal(progNow)}` : "—")}
              </span>
            </div>
            <div className="metric-big">
              <span className="v">{progNow != null ? (isTime ? fmtDur(progNow) : progNow) : "—"}</span>
              {!isTime && progNow != null && <span className="u">{unit}</span>}
              <span className={`d${progDelta > 0 ? "" : " flat"}`}>
                {progVals.length > 1 ? `↑ +${progDelta} ${unit} since start` : "log more to trend"}
              </span>
            </div>
            <div className="lift-select">
              {visibleLifts.map((e) => (
                <button key={e.id} className={`ls${e.id === liftId ? " on" : ""}`} onClick={() => setLiftId(e.id)}>
                  {e.name}
                </button>
              ))}
              {orderedLifts.length > VISIBLE_LIFT_CHIPS && (
                <button className="ls" onClick={() => setAllLiftsShown(!allLiftsShown)}>
                  {allLiftsShown ? "Fewer" : `+${orderedLifts.length - VISIBLE_LIFT_CHIPS} more`}
                </button>
              )}
            </div>
            <LineChart
              data={progVals}
              labels={progLabels}
              color="#f2a43c"
              onHover={(_i, v, l) => setProgReadout(`${l} · ${fmtVal(v)}`)}
              onLeave={() => setProgReadout(null)}
            />
          </div>

          <div className="card">
            <div className="card-head">
              <p className="eyebrow">Fuel adherence · 7 days</p>
              <div className="seg">
                <button className={fuelKind === "protein" ? "on" : ""} onClick={() => setFuelKind("protein")}>
                  Protein
                </button>
                <button className={fuelKind === "cal" ? "on" : ""} onClick={() => setFuelKind("cal")}>
                  Calories
                </button>
              </div>
            </div>
            <div className="card-head" style={{ marginTop: 8 }}>
              <span className="readout">{fuelReadout ?? adherence}</span>
            </div>
            <BarChart
              data={fuelVals}
              goal={fuelGoal}
              labels={fuelLabels}
              onHover={(i, v) =>
                setFuelReadout(`${fuelLabels[i]} · ${v === null ? "not logged" : `${v} ${fuelUnit}`}`)
              }
              onLeave={() => setFuelReadout(null)}
            />
          </div>

          {records.length > 0 && (
            <div className="card">
              <div className="card-head">
                <p className="eyebrow">Records</p>
                <span className="readout">🏆 {allRecordsShown ? "all-time bests" : "latest PRs"}</span>
              </div>
              <ul className="rec-list">
                {shownRecords.map((ex) => (
                  <li key={ex.exerciseId} className="rec-ex">
                    <span className="rec-name">{ex.name}</span>
                    <div className="rec-prs">
                      {ex.records.map((r) => (
                        <span key={r.kind} className="rec-pr">
                          <span className="rec-pr-k">{PR_LABEL[r.kind]}</span>
                          <span className="rec-pr-v">{fmtRecord(r)}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              {recordCount > RECENT_RECORDS && (
                <div className="expand-row">
                  <button className="ls" onClick={() => setAllRecordsShown(!allRecordsShown)}>
                    {allRecordsShown ? "Show fewer" : "See all records"}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
