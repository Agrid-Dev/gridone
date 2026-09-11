import type { Pt } from "../types";
import { InstrumentLink } from "./InstrumentLink";

type SensorFlagProps = {
  /** Anchor of the flag icon (top-left of the pole). */
  x: number;
  y: number;
  label: string;
  value: string | number;
  unit: string;
  /** Equipment port this sensor measures: a dotted signal line is drawn to it. */
  port: Pt;
};

/** Field sensor: pennant icon, tag label, live value box and dotted signal line to its port. */
export function SensorFlag({
  x,
  y,
  label,
  value,
  unit,
  port,
}: SensorFlagProps) {
  const poleBottom = { x, y: y + 28 };
  return (
    <g>
      <InstrumentLink from={port} to={poleBottom} />
      {/* pennant icon */}
      <g
        strokeWidth={2.4}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-foreground"
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
        fontSize={15}
        fontWeight={600}
        className="fill-foreground"
      >
        {label}
      </text>
      <rect
        x={x - 12}
        y={y + 38}
        width={64}
        height={26}
        strokeWidth={1.5}
        className="fill-card stroke-border"
      />
      <text
        x={x + 20}
        y={y + 51}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        className="fill-foreground"
      >
        {value}
      </text>
      <text
        x={x + 60}
        y={y + 51}
        dominantBaseline="central"
        fontSize={13.5}
        className="fill-muted-foreground"
      >
        {unit}
      </text>
    </g>
  );
}
