import { COLORS } from "../theme";
import type { Pt } from "../types";

type SensorFlagProps = {
  /** Anchor of the flag icon (top-left of the pole). */
  x: number;
  y: number;
  label: string;
  value: string | number;
  unit: string;
  /** Equipment port this sensor measures — a dotted signal line is drawn to it. */
  port: Pt;
  /** Signal line color (defaults to the steam/alarm red used by temperature probes). */
  color?: string;
};

/** Field sensor: pennant icon, tag label, live value box and dotted signal line to its port. */
export function SensorFlag({
  x,
  y,
  label,
  value,
  unit,
  port,
  color = COLORS.steam,
}: SensorFlagProps) {
  const poleBottom = { x, y: y + 28 };
  return (
    <g>
      <path
        d={`M ${port.x} ${port.y} L ${poleBottom.x} ${poleBottom.y}`}
        stroke={color}
        strokeWidth={2.4}
        strokeDasharray="0.5 7"
        strokeLinecap="round"
        fill="none"
      />
      {/* pennant icon */}
      <g
        stroke={COLORS.text}
        strokeWidth={2.4}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <line x1={x} y1={y + 28} x2={x + 9} y2={y} />
        <path
          d={`M ${x + 9} ${y} L ${x + 31} ${y + 7} L ${x + 7} ${y + 15} Z`}
        />
      </g>
      <text
        x={x + 40}
        y={y + 8}
        dominantBaseline="central"
        fill={COLORS.text}
        fontSize={15}
        fontWeight={600}
      >
        {label}
      </text>
      <rect
        x={x - 12}
        y={y + 38}
        width={64}
        height={26}
        fill={COLORS.bg}
        stroke={COLORS.valueBoxStroke}
        strokeWidth={1.5}
      />
      <text
        x={x + 20}
        y={y + 51}
        textAnchor="middle"
        dominantBaseline="central"
        fill={COLORS.text}
        fontSize={15}
      >
        {value}
      </text>
      <text
        x={x + 60}
        y={y + 51}
        dominantBaseline="central"
        fill={COLORS.text}
        fontSize={13.5}
      >
        {unit}
      </text>
    </g>
  );
}
