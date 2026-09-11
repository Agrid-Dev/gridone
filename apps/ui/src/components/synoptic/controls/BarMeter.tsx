import { COLORS } from "../theme";

type BarMeterProps = {
  x: number;
  y: number;
  w?: number;
  h?: number;
  min: number;
  max: number;
  value: number;
  /** Optional setpoint marker drawn as an amber triangle on the left edge. */
  setpoint?: number;
  label?: string;
  unit?: string;
  color?: string;
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
  color = "#4fa3d1",
  decimals = 1,
}: BarMeterProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const frac = (clamped - min) / (max - min);
  const fillH = (h - 4) * frac;
  const ticks = 5;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="#1a2634"
        stroke="#3a4552"
        strokeWidth={1.5}
      />
      <rect
        x={x + 2}
        y={y + h - 2 - fillH}
        width={w - 4}
        height={fillH}
        fill={color}
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
              stroke="#7f8b96"
              strokeWidth={1.5}
            />
            <text
              x={x + w + 10}
              y={ty}
              dominantBaseline="central"
              fill="#9aa7b4"
              fontSize={11}
            >
              {Math.round(tv)}
            </text>
          </g>
        );
      })}
      {setpoint !== undefined && (
        <path
          d={`M ${x - 10} ${y + h - 2 - (h - 4) * ((setpoint - min) / (max - min)) - 7} L ${x - 10} ${y + h - 2 - (h - 4) * ((setpoint - min) / (max - min)) + 7} L ${x} ${y + h - 2 - (h - 4) * ((setpoint - min) / (max - min))} Z`}
          fill="#f0af3d"
        />
      )}
      <text
        x={x + w / 2}
        y={y + h + 18}
        textAnchor="middle"
        fill={COLORS.text}
        fontSize={14}
        fontWeight={600}
      >
        {clamped.toFixed(decimals)}
        {unit ? ` ${unit}` : ""}
      </text>
      {label && (
        <text
          x={x + w / 2}
          y={y - 12}
          textAnchor="middle"
          fill="#9aa7b4"
          fontSize={12.5}
        >
          {label}
        </text>
      )}
    </g>
  );
}
