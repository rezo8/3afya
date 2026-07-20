import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BodyMetric, ExerciseRecords, PrEntry, ProgressTrend, TrendExercise } from "@afya/shared";
import { api } from "@/lib/api/client";
import { PR_LABEL } from "@/lib/pr";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";

type FuelHistory = {
  target: { proteinG: number; calories: number };
  days: { date: string; proteinG: number; calories: number }[];
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
const fmtDur = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

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
  const bwQ = useQuery({
    queryKey: ["metrics", "weight"],
    queryFn: () => api.get<BodyMetric[]>("/api/metrics?kind=weight"),
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
  const [bwReadout, setBwReadout] = useState<string | null>(null);
  const [fuelReadout, setFuelReadout] = useState<string | null>(null);
  const [fuelKind, setFuelKind] = useState<"protein" | "cal">("protein");

  const prog = progQ.data;
  const isTime = prog?.metric === "time";
  const unit = prog?.unit ?? "";
  const fmtVal = (v: number) => (isTime ? fmtDur(v) : `${v} ${unit}`);
  const progVals = prog?.points.map((p) => p.value) ?? [];
  const progLabels = prog?.points.map((p) => shortDate(p.date)) ?? [];
  const progNow = progVals.at(-1);
  const progDelta = progVals.length > 1 ? progNow! - progVals[0]! : 0;

  const bw = bwQ.data ?? [];
  const bwVals = bw.map((m) => m.value);
  const bwLabels = bw.map((m) => shortDate(m.measuredAt));
  const bwNow = bwVals.at(-1);
  const bwDelta = bwVals.length > 1 ? +(bwNow! - bwVals[0]!).toFixed(1) : 0;

  const fuel = fuelQ.data;
  const fuelVals = fuel ? fuel.days.map((d) => (fuelKind === "protein" ? Math.round(d.proteinG) : Math.round(d.calories))) : [];
  const fuelLabels = fuel ? fuel.days.map((d) => weekday(d.date)) : [];
  const fuelGoal = fuel ? (fuelKind === "protein" ? fuel.target.proteinG : fuel.target.calories) : 0;
  const fuelUnit = fuelKind === "protein" ? "g" : "kcal";
  const fuelHits = fuelVals.filter((v) => v >= fuelGoal).length;

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
          {recordsQ.data && recordsQ.data.length > 0 && (
            <div className="card">
              <div className="card-head">
                <p className="eyebrow">Records</p>
                <span className="readout">🏆 all-time bests</span>
              </div>
              <ul className="rec-list">
                {recordsQ.data.map((ex) => (
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
            </div>
          )}

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
              {exQ.data?.map((e) => (
                <button key={e.id} className={`ls${e.id === liftId ? " on" : ""}`} onClick={() => setLiftId(e.id)}>
                  {e.name}
                </button>
              ))}
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
              <p className="eyebrow">Bodyweight</p>
              <span className="readout">{bwReadout ?? `${bw.length} entries`}</span>
            </div>
            <div className="metric-big">
              <span className="v">{bwNow ?? "—"}</span>
              <span className="u">lb</span>
              <span className={`d${bwDelta > 0 ? "" : " flat"}`}>
                {bwVals.length > 1 ? `${bwDelta > 0 ? "↑ +" : "↓ "}${bwDelta} lb overall` : "log your weight to trend"}
              </span>
            </div>
            <LineChart
              data={bwVals}
              labels={bwLabels}
              color="#a6bd6a"
              onHover={(_i, v, l) => setBwReadout(`${l} · ${v} lb`)}
              onLeave={() => setBwReadout(null)}
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
              <span className="readout">{fuelReadout ?? `${fuelHits} / ${fuelVals.length} days on target`}</span>
            </div>
            <BarChart
              data={fuelVals}
              goal={fuelGoal}
              labels={fuelLabels}
              onHover={(i, v) => setFuelReadout(`${fuelLabels[i]} · ${v} ${fuelUnit}`)}
              onLeave={() => setFuelReadout(null)}
            />
          </div>
        </>
      )}
    </>
  );
}
