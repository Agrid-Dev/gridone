import { COLORS } from "../theme";

type PumpProps = {
  /** Center of the pump body. */
  cx: number;
  cy: number;
  r?: number;
  label?: string;
  labelPos?: "top" | "bottom";
};

/** Centrifugal pump: round casing with a volute tail and a mounting base. */
export function Pump({ cx, cy, r = 27, label, labelPos = "top" }: PumpProps) {
  const volute = [
    `M ${cx - r * 1.75} ${cy + r * 0.8}`,
    `Q ${cx - r * 1.55} ${cy - r * 0.55} ${cx - r * 0.35} ${cy - r * 0.95}`,
    `L ${cx - r * 0.1} ${cy + r * 0.95}`,
    "Z",
  ].join(" ");
  return (
    <g>
      {/* mounting base */}
      <rect
        x={cx - r * 0.95}
        y={cy + r * 0.8}
        width={r * 1.9}
        height={r * 0.42}
        rx={3}
        fill={COLORS.pumpDark}
        stroke={COLORS.pumpStroke}
        strokeWidth={2}
      />
      {/* volute tail */}
      <path
        d={volute}
        fill={COLORS.pumpFill}
        stroke={COLORS.pumpStroke}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* casing */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={COLORS.pumpFill}
        stroke={COLORS.pumpStroke}
        strokeWidth={3}
      />
      {/* impeller hint */}
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.52}
        fill="none"
        stroke={COLORS.pumpDark}
        strokeWidth={3.5}
      />
      {label && (
        <text
          x={labelPos === "top" ? cx + r * 0.3 : cx}
          y={labelPos === "top" ? cy - r - 14 : cy + r * 1.22 + 20}
          textAnchor="middle"
          fill={COLORS.text}
          fontSize={15}
          fontWeight={600}
        >
          {label}
        </text>
      )}
    </g>
  );
}
