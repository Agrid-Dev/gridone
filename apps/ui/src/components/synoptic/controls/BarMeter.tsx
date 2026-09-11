import { SEMANTIC_FILL_CLASS } from "@/lib/semanticColors";
import { fraction } from "../geometry";

type BarMeterProps = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  min: number;
  max: number;
  value: number;
  /** Optional setpoint marker drawn as a triangle on the left edge. */
  setpoint?: number;
  label?: string;
  unit?: string;
  decimals?: number;
};

/** Vertical analog bar indicator with scale ticks, optional setpoint marker and readout. */
export function BarMeter({
  x,
  y,
  w = 46,
  h = 170,
  min,
  max,
  value,
  setpoint,
  label,
  unit,
  decimals = 1,
}: BarMeterProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const fillH = (h - 4) * fraction(value, min, max);
  /** Bar y for a value, clamped to the scale. */
  const toY = (v: number) => y + h - 2 - (h - 4) * fraction(v, min, max);
  const ticks = 5;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        strokeWidth={1.5}
        className="fill-card stroke-border"
      />
      <rect
        x={x + 2}
        y={toY(clamped)}
        width={w - 4}
        height={fillH}
        className="fill-primary"
      />
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const ty = y + h - (h * i) / ticks;
        const tv = min + ((max - min) * i) / ticks;
        return (
          <g key={i}>
            <line
              x1={x + w}
              y1={ty}
              x2={x + w + 6}
              y2={ty}
              strokeWidth={1.5}
              className="stroke-muted-foreground"
            />
            <text
              x={x + w + 10}
              y={ty}
              dominantBaseline="central"
              fontSize={11}
              className="fill-muted-foreground"
            >
              {Math.round(tv)}
            </text>
          </g>
        );
      })}
      {setpoint !== undefined && (
        <path
          d={`M ${x - 10} ${toY(setpoint) - 7} L ${x - 10} ${toY(setpoint) + 7} L ${x} ${toY(setpoint)} Z`}
          className={SEMANTIC_FILL_CLASS.warning}
        />
      )}
      <text
        x={x + w / 2}
        y={y + h + 18}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        className="fill-foreground"
      >
        {clamped.toFixed(decimals)}
        {unit ? ` ${unit}` : ""}
      </text>
      {label && (
        <text
          x={x + w / 2}
          y={y - 12}
          textAnchor="middle"
          fontSize={12.5}
          className="fill-muted-foreground"
        >
          {label}
        </text>
      )}
    </g>
  );
}
