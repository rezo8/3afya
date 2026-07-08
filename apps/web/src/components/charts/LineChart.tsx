import { useId, useRef, useState } from "react";

type Props = {
  data: number[];
  labels?: string[];
  color?: string;
  onHover?: (i: number, v: number, label: string) => void;
  onLeave?: () => void;
};

const W = 640;
const H = 240;
const PL = 8;
const PR = 10;
const PT = 18;
const PB = 26;

/** Single-hue area+line with an emphasized endpoint and a hover crosshair. */
export function LineChart({ data, labels, color = "#f2a43c", onHover, onLeave }: Props) {
  const gid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) {
    return <p className="center-note">Not enough data yet — log a few sessions.</p>;
  }

  const lbls = labels ?? data.map((_, i) => `W${i + 1}`);
  const min = Math.min(...data);
  const max = Math.max(...data);
  const padv = (max - min) * 0.25 || 1;
  const lo = min - padv;
  const hi = max + padv;
  const x = (i: number) => PL + (i * (W - PL - PR)) / (data.length - 1);
  const y = (v: number) => PT + (H - PT - PB) * (1 - (v - lo) / (hi - lo));
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${H - PB} L${PL} ${H - PB} Z`;
  const gridY = [0, 1, 2].map((g) => PT + ((H - PT - PB) * g) / 2);
  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const cur = hover ?? data.length - 1;

  function move(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let idx = Math.round((px - PL) / ((W - PL - PR) / (data.length - 1)));
    idx = Math.max(0, Math.min(data.length - 1, idx));
    setHover(idx);
    onHover?.(idx, data[idx]!, lbls[idx]!);
  }
  function leave() {
    setHover(null);
    onLeave?.();
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
      onTouchMove={(e) => move(e.touches[0]!.clientX)}
      onTouchEnd={leave}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridY.map((gy, i) => (
        <line key={i} x1={PL} y1={gy} x2={W - PR} y2={gy} stroke="rgba(243,233,218,0.06)" strokeWidth="1" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {labelIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 6}
          fill="#a58e74"
          fontSize="12"
          fontFamily="ui-monospace,Menlo,monospace"
          textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
        >
          {lbls[i]}
        </text>
      ))}
      {hover !== null && (
        <line x1={pts[cur]![0]} y1={PT} x2={pts[cur]![0]} y2={H - PB} stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />
      )}
      <circle cx={pts[cur]![0]} cy={pts[cur]![1]} r="6.5" fill={color} stroke="#211a12" strokeWidth="3" />
    </svg>
  );
}
