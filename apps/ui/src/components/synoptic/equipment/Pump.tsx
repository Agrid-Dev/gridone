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
    <g className="stroke-synoptic-stroke">
      {/* mounting base */}
      <rect
        x={cx - r * 0.95}
        y={cy + r * 0.8}
        width={r * 1.9}
        height={r * 0.42}
        rx={3}
        strokeWidth={2}
        className="fill-synoptic-body-y"
      />
      {/* volute tail */}
      <path
        d={volute}
        strokeWidth={2}
        strokeLinejoin="round"
        className="fill-synoptic-body"
      />
      {/* casing */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={2}
        className="fill-synoptic-body"
      />
      {/* impeller hint */}
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.52}
        fill="none"
        strokeWidth={1.25}
        className="stroke-muted-foreground"
      />
      {label && (
        <text
          x={labelPos === "top" ? cx + r * 0.3 : cx}
          y={labelPos === "top" ? cy - r - 14 : cy + r * 1.22 + 20}
          textAnchor="middle"
          fontSize={15}
          fontWeight={600}
          stroke="none"
          className="fill-foreground"
        >
          {label}
        </text>
      )}
    </g>
  );
}
