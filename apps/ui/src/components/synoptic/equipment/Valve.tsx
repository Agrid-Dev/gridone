import { COLORS } from "../theme";

type ValveProps = {
  /** Center of the valve body (on the pipe axis). */
  cx: number;
  cy: number;
  w?: number;
  h?: number;
  /** red = actuated control valve, white = inline instrument/manual valve. */
  variant?: "red" | "white";
  /** Direction of the actuator stem. */
  stem?: "up" | "down" | "none";
  label?: string;
  labelPos?: "top" | "bottom";
};

const STEM_LEN = 26;
const CAP_W = 22;

/** Inline valve: bowtie body with an actuator stem, colored by state/type. */
export function Valve({
  cx,
  cy,
  w = 58,
  h = 30,
  variant = "white",
  stem = "up",
  label,
  labelPos,
}: ValveProps) {
  const fill = variant === "red" ? COLORS.valveRed : COLORS.valveWhite;
  const stroke =
    variant === "red" ? COLORS.valveRedStroke : COLORS.valveWhiteStroke;
  const x = cx - w / 2;
  const hh = h / 2;
  const points = `${x},${cy - hh} ${cx},${cy} ${x + w},${cy - hh} ${x + w},${cy + hh} ${cx},${cy} ${x},${cy + hh}`;

  const stemDir = stem === "up" ? -1 : 1;
  const stemEnd = cy + stemDir * (hh + STEM_LEN);
  const lp = labelPos ?? (stem === "down" ? "top" : "bottom");
  const labelY =
    lp === "top"
      ? cy - hh - (stem === "up" ? STEM_LEN + 14 : 14)
      : cy + hh + (stem === "down" ? STEM_LEN + 20 : 20);

  return (
    <g>
      {stem !== "none" && (
        <g stroke={fill} strokeWidth={3.5} strokeLinecap="round">
          <line x1={cx} y1={cy} x2={cx} y2={stemEnd} />
          <line
            x1={cx - CAP_W / 2}
            y1={stemEnd}
            x2={cx + CAP_W / 2}
            y2={stemEnd}
          />
        </g>
      )}
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {label && (
        <text
          x={cx}
          y={labelY}
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
