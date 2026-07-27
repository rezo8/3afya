import { useRef, useState, type TouchList } from "react";

type Props = {
  /** A null day has nothing logged — drawn as a gap, never as a zero-height bar. */
  data: (number | null)[];
  goal: number;
  labels: string[];
  onHover?: (i: number, v: number | null, label: string) => void;
  onLeave?: () => void;
};

const W = 640;
const H = 240;
const PL = 8;
const PR = 8;
const PT = 20;
const PB = 26;
const GAP = 14;
const GAP_MARK_H = 10;

/** Daily bars against a goal line — bars that hit the goal read sage, misses dim. */
export function BarChart({ data, goal, labels, onHover, onLeave }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="center-note">No data in range.</p>;

  const logged = data.filter((v): v is number => v !== null);
  const max = Math.max(goal, ...logged) * 1.12 || 1;
  const bw = (W - PL - PR - GAP * (data.length - 1)) / data.length;
  const barX = (i: number) => PL + i * (bw + GAP);
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const gy = y(goal);

  function move(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const nearest = Math.round((px - PL - bw / 2) / (bw + GAP));
    const i = Math.max(0, Math.min(data.length - 1, nearest));
    setHover(i);
    onHover?.(i, data[i] ?? null, labels[i] ?? "");
  }
  function leave() {
    setHover(null);
    onLeave?.();
  }
  function touch(touches: TouchList) {
    const first = touches[0];
    if (first) move(first.clientX);
  }

  return (
    <svg
      ref={svgRef}
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      onMouseMove={(e) => move(e.clientX)}
      onMouseLeave={leave}
      onTouchStart={(e) => touch(e.touches)}
      onTouchMove={(e) => touch(e.touches)}
      onTouchEnd={leave}
    >
      {data.map((v, i) => (
        <g key={i}>
          {v === null ? (
            <rect
              x={barX(i).toFixed(1)}
              y={(H - PB - GAP_MARK_H).toFixed(1)}
              width={bw.toFixed(1)}
              height={GAP_MARK_H}
              rx="5"
              fill="none"
              stroke="#a58e74"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity={hover === i ? 0.85 : 0.45}
            />
          ) : (
            <rect
              x={barX(i).toFixed(1)}
              y={y(v).toFixed(1)}
              width={bw.toFixed(1)}
              height={Math.max(2, H - PB - y(v)).toFixed(1)}
              rx="5"
              fill={v >= goal ? "#a6bd6a" : "#6d5327"}
              opacity={hover === i ? 0.75 : 1}
            />
          )}
          <text
            x={(barX(i) + bw / 2).toFixed(1)}
            y={H - 7}
            fill="#a58e74"
            fontSize="12"
            fontFamily="ui-monospace,Menlo,monospace"
            textAnchor="middle"
            opacity={v === null ? 0.55 : 1}
          >
            {labels[i]}
          </text>
        </g>
      ))}
      <line x1={PL} y1={gy.toFixed(1)} x2={W - PR} y2={gy.toFixed(1)} stroke="#f4ead9" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
      <text x={W - PR} y={(gy - 7).toFixed(1)} fill="#f4ead9" fontSize="12" fontFamily="ui-monospace,Menlo,monospace" textAnchor="end" opacity="0.7">
        goal {goal}
      </text>
    </svg>
  );
}
