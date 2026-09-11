import { COLORS } from "../theme";

type ReadoutProps = {
  /** Top-left of the value box. */
  x: number;
  y: number;
  w?: number;
  h?: number;
  value: string | number;
  unit?: string;
  /** Small caption above the box. */
  label?: string;
  valueColor?: string;
};

/** Digital value box in the monitor style (dark fill, orange border). */
export function Readout({
  x,
  y,
  w = 112,
  h = 32,
  value,
  unit,
  label,
  valueColor = COLORS.text,
}: ReadoutProps) {
  return (
    <g>
      {label && (
        <text x={x} y={y - 9} fill="#9aa7b4" fontSize={12.5}>
          {label}
        </text>
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={COLORS.valueBoxFill}
        stroke={COLORS.valueBoxStroke}
        strokeWidth={1.5}
      />
      <text
        x={x + w / 2}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={valueColor}
        fontSize={15}
        fontWeight={600}
      >
        {value}
        {unit ? ` ${unit}` : ""}
      </text>
    </g>
  );
}
