import {
  SEMANTIC_FILL_CLASS,
  SEMANTIC_STROKE_CLASS,
  type StatusLevel,
} from "@/lib/semanticColors";
import {
  arcPath,
  DIAL_START_DEG,
  DIAL_SWEEP_DEG,
  fraction,
  polarPoint as polar,
} from "../geometry";

export type GaugeZone = { from: number; to: number; level: StatusLevel };

type RadialGaugeProps = {
  cx: number;
  cy: number;
  r: number;
  min: number;
  max: number;
  value: number;
  label?: string;
  unit?: string;
  /** Coloured arc bands (e.g. ok / warning / error operating ranges). */
  zones?: GaugeZone[];
  /** Number of major divisions on the scale. */
  majorTicks?: number;
  decimals?: number;
};

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
  const angle = (v: number) =>
    DIAL_START_DEG + DIAL_SWEEP_DEG * fraction(v, min, max);
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
        strokeWidth={2}
        className="fill-card stroke-border"
      />
      {zones.map((z, i) => (
        <path
          key={i}
          d={arcPath(
            cx,
            cy,
            r * 0.86,
            angle(Math.min(z.from, z.to)),
            angle(Math.max(z.from, z.to)),
          )}
          fill="none"
          strokeWidth={r * 0.09}
          className={SEMANTIC_STROKE_CLASS[z.level]}
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
              strokeWidth={2}
              className="stroke-foreground"
            />
            <text
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={r * 0.13}
              className="fill-muted-foreground"
            >
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      <polygon
        points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`}
        className={SEMANTIC_FILL_CLASS.error}
      />
      <circle cx={cx} cy={cy} r={r * 0.07} className="fill-muted-foreground" />
      <text
        x={cx}
        y={cy + r * 0.45}
        textAnchor="middle"
        fontSize={r * 0.19}
        fontWeight={600}
        className="fill-foreground"
      >
        {clamped.toFixed(decimals)}
        {unit ? ` ${unit}` : ""}
      </text>
      {label && (
        <text
          x={cx}
          y={cy - r * 0.32}
          textAnchor="middle"
          fontSize={r * 0.14}
          className="fill-muted-foreground"
        >
          {label}
        </text>
      )}
    </g>
  );
}
