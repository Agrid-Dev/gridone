type ValveProps = {
  /** Center of the valve body (on the pipe axis). */
  cx: number;
  cy: number;
  w?: number;
  h?: number;
  /** A closed valve is a solid bowtie, an open one is hollow. */
  closed?: boolean;
  /** Direction of the actuator stem. */
  stem?: "up" | "down" | "none";
  label?: string;
  labelPos?: "top" | "bottom";
};

const STEM_LEN = 26;
const CAP_W = 22;

/** Inline valve: bowtie body with an actuator stem, solid when closed. */
export function Valve({
  cx,
  cy,
  w = 58,
  h = 30,
  closed = false,
  stem = "up",
  label,
  labelPos,
}: ValveProps) {
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
    <g className="stroke-synoptic-stroke">
      {stem !== "none" && (
        <g strokeWidth={2} strokeLinecap="round">
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
        strokeWidth={2}
        strokeLinejoin="round"
        className={closed ? "fill-synoptic-stroke" : "fill-synoptic-body"}
      />
      {label && (
        <text
          x={cx}
          y={labelY}
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
