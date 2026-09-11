import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddBodyMetricBody, BodyMetric, BodyMetricKind } from "@afya/shared";
import { api } from "@/lib/api/client";
import { daysAgo } from "@/lib/dates";
import { LineChart } from "@/components/charts/LineChart";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

type MetricCfg = {
  kind: BodyMetricKind;
  label: string;
  unit: string;
  step: number;
  precision: number;
  fallback: number;
  color: string;
};

const METRICS: MetricCfg[] = [
  { kind: "weight", label: "Weight", unit: "lb", step: 1, precision: 1, fallback: 165, color: "var(--accent)" },
  { kind: "resting_hr", label: "Resting HR", unit: "bpm", step: 1, precision: 0, fallback: 60, color: "var(--alert)" },
  { kind: "sleep_hours", label: "Sleep", unit: "h", step: 0.5, precision: 1, fallback: 8, color: "var(--good)" },
];

function MetricCard({ cfg }: { cfg: MetricCfg }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["metrics", cfg.kind], queryFn: () => api.get<BodyMetric[]>(`/api/metrics?kind=${cfg.kind}`) });
  const rows = q.data ?? [];
  const latest = rows.at(-1) ?? null;
  const [val, setVal] = useState<number | null>(null);
  const [readout, setReadout] = useState<string | null>(null);

  useEffect(() => {
    if (val == null && latest) setVal(latest.value);
  }, [latest?.value, val]);

  const current = val ?? latest?.value ?? cfg.fallback;
  const fmt = (n: number) => (cfg.precision === 0 ? String(Math.round(n)) : n.toFixed(cfg.precision));
  const bump = (d: number) => setVal(Math.max(0, +(current + d).toFixed(cfg.precision)));

  const log = useMutation({
    mutationFn: (value: number) => api.post<BodyMetric>("/api/metrics", { kind: cfg.kind, value } satisfies AddBodyMetricBody),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["metrics", cfg.kind] }),
  });

  const vals = rows.map((r) => r.value);
  const labels = rows.map((r) => shortDate(r.measuredAt));
  const delta = vals.length > 1 ? +(vals.at(-1)! - vals[0]!).toFixed(cfg.precision) : 0;

  // The big number is whatever was measured last, however long ago that was, and
  // one Log tap re-stamps it as today. Say the age instead of guarding the tap —
  // re-logging the same value is legitimate and has to stay one tap.
  const staleDays = latest ? daysAgo(new Date(latest.measuredAt)) : 0;

  return (
    <div className="card">
      <div className="card-head">
        <p className="eyebrow">{cfg.label}</p>
        <span className="readout">{readout ?? `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}</span>
      </div>
      <div className="metric-big">
        <span className="v">{latest ? fmt(latest.value) : "—"}</span>
        <span className="u">{cfg.unit}</span>
        <span className={`d${delta > 0 ? "" : " flat"}`}>
          {vals.length > 1 ? `${delta > 0 ? "↑ +" : "↓ "}${delta} ${cfg.unit} overall` : "log to start the trend"}
        </span>
      </div>
      {staleDays > 0 && <p className="metric-stale">last logged {staleDays}d ago</p>}

      <div className="bm-log">
        <button className="step" aria-label={`Decrease ${cfg.label}`} onClick={() => bump(-cfg.step)}>
          −
        </button>
        <div className="bm-val">
          {fmt(current)}
          <span className="u">{cfg.unit}</span>
        </div>
        <button className="step" aria-label={`Increase ${cfg.label}`} onClick={() => bump(cfg.step)}>
          +
        </button>
        <button className="btn bm-save" onClick={() => log.mutate(current)} disabled={log.isPending}>
          {log.isPending ? "…" : "Log"}
        </button>
      </div>

      {vals.length >= 2 && (
        <LineChart
          data={vals}
          labels={labels}
          color={cfg.color}
          onHover={(_i, v, l) => setReadout(`${l} · ${fmt(v)} ${cfg.unit}`)}
          onLeave={() => setReadout(null)}
        />
      )}
    </div>
  );
}

export function BodyScreen() {
  return (
    <>
      <div className="view-head">
        <p className="eyebrow">Body</p>
        <h1>Measurements</h1>
      </div>
      {METRICS.map((cfg) => (
        <MetricCard key={cfg.kind} cfg={cfg} />
      ))}
    </>
  );
}
