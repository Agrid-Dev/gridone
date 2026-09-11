import { COLORS } from "./theme";

type PipeBadgeProps = {
  /** Center of the badge. */
  x: number;
  y: number;
  text: string;
  w?: number;
  h?: number;
};

/** Small rounded tag riding on a pipe (line/fluid code such as LPS, SC, CPO...). */
export function PipeBadge({ x, y, text, w, h = 27 }: PipeBadgeProps) {
  const width = w ?? Math.max(46, text.length * 11 + 20);
  return (
    <g>
      <rect
        x={x - width / 2}
        y={y - h / 2}
        width={width}
        height={h}
        rx={7}
        fill={COLORS.badgeFill}
        stroke={COLORS.badgeStroke}
        strokeWidth={1.2}
      />
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fill={COLORS.text}
        fontSize={14}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}
