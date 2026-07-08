import { useState } from "react";

type Props = {
  data: number[];
  goal: number;
  labels: string[];
  onHover?: (i: number, v: number, label: string) => void;
  onLeave?: () => void;
};

const W = 640;
const H = 240;
const PL = 8;
const PR = 8;
const PT = 20;
const PB = 26;
const GAP = 14;

/** Daily bars against a goal line — bars that hit the goal read sage, misses dim. */
export function BarChart({ data, goal, labels, onHover, onLeave }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="center-note">No data in range.</p>;

  const max = Math.max(goal, ...data) * 1.12 || 1;
  const bw = (W - PL - PR - GAP * (data.length - 1)) / data.length;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const gy = y(goal);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" onMouseLeave={() => { setHover(null); onLeave?.(); }}>
      {data.map((v, i) => {
        const bx = PL + i * (bw + GAP);
        const by = y(v);
        const bh = Math.max(2, H - PB - by);
        const hit = v >= goal;
        return (
          <g key={i}>
            <rect
              x={bx.toFixed(1)}
              y={by.toFixed(1)}
              width={bw.toFixed(1)}
              height={bh.toFixed(1)}
              rx="5"
              fill={hit ? "#a6bd6a" : "#6d5327"}
              opacity={hover === i ? 0.75 : 1}
              onMouseEnter={() => { setHover(i); onHover?.(i, v, labels[i] ?? ""); }}
            />
            <text
              x={(bx + bw / 2).toFixed(1)}
              y={H - 7}
              fill="#a58e74"
              fontSize="12"
              fontFamily="ui-monospace,Menlo,monospace"
              textAnchor="middle"
            >
              {labels[i]}
            </text>
          </g>
        );
      })}
      <line x1={PL} y1={gy.toFixed(1)} x2={W - PR} y2={gy.toFixed(1)} stroke="#f4ead9" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
      <text x={W - PR} y={(gy - 7).toFixed(1)} fill="#f4ead9" fontSize="12" fontFamily="ui-monospace,Menlo,monospace" textAnchor="end" opacity="0.7">
        goal {goal}
      </text>
    </svg>
  );
}
