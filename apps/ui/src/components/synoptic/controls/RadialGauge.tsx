import { COLORS } from "../theme";

export type GaugeZone = { from: number; to: number; color: string };

type RadialGaugeProps = {
  cx: number;
  cy: number;
  r: number;
  min: number;
  max: number;
  value: number;
  label?: string;
  unit?: string;
  /** Colored arc bands (e.g. green/amber/red operating ranges). */
  zones?: GaugeZone[];
  /** Number of major divisions on the scale. */
  majorTicks?: number;
  decimals?: number;
};

const START = 135; // degrees — gauge zero position
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

/** 270° analog dial with zone bands, scale ticks, needle and digital readout. */
export function RadialGauge({
  cx,
  cy,
  r,
  min,
  max,
  value,
  label,
  unit,
  zones = [],
  majorTicks = 5,
  decimals = 0,
}: RadialGaugeProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const angle = (v: number) => START + (SWEEP * (v - min)) / (max - min);
  const needleA = angle(clamped);
  const tip = polar(cx, cy, r * 0.72, needleA);
  const b1 = polar(cx, cy, r * 0.08, needleA + 90);
  const b2 = polar(cx, cy, r * 0.08, needleA - 90);
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="#1a2634"
        stroke="#3a4552"
        strokeWidth={2}
      />
      {zones.map((z, i) => (
        <path
          key={i}
          d={arcPath(cx, cy, r * 0.86, angle(z.from), angle(z.to))}
          fill="none"
          stroke={z.color}
          strokeWidth={r * 0.09}
        />
      ))}
      {Array.from({ length: majorTicks + 1 }, (_, i) => {
        const v = min + ((max - min) * i) / majorTicks;
        const a = angle(v);
        const p1 = polar(cx, cy, r * 0.8, a);
        const p2 = polar(cx, cy, r * 0.92, a);
        const pt = polar(cx, cy, r * 0.6, a);
        return (
          <g key={i}>
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={COLORS.text}
              strokeWidth={2}
            />
            <text
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#9aa7b4"
              fontSize={r * 0.13}
            >
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      <polygon
        points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`}
        fill="#e2333f"
      />
      <circle cx={cx} cy={cy} r={r * 0.07} fill="#cfd6dd" />
      <text
        x={cx}
        y={cy + r * 0.45}
        textAnchor="middle"
        fill={COLORS.text}
        fontSize={r * 0.19}
        fontWeight={600}
      >
        {clamped.toFixed(decimals)}
        {unit ? ` ${unit}` : ""}
      </text>
      {label && (
        <text
          x={cx}
          y={cy - r * 0.32}
          textAnchor="middle"
          fill="#9aa7b4"
          fontSize={r * 0.14}
        >
          {label}
        </text>
      )}
    </g>
  );
}
