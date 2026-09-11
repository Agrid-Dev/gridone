import type { Fluid } from "@gridone/sdk";
import { FLUID_STROKE_CLASS } from "@/lib/fluidColors";

type ExternalLinkProps = {
  /** Top-left of the banner's bounding box. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Fluid of the connected pipe, which colours the border. */
  fluid: Fluid;
  /**
   * 'in'  = flow enters the diagram (arrow tip on the right)
   * 'out' = flow leaves the diagram (arrow tip on the left)
   */
  direction: "in" | "out";
  /** One or two lines of text. */
  label: string | string[];
};

/** Off-page banner marking a flow coming from / going to another system. */
export function ExternalLink({
  x,
  y,
  w,
  h,
  fluid,
  direction,
  label,
}: ExternalLinkProps) {
  const tip = Math.min(h * 0.95, 62);
  const d =
    direction === "in"
      ? `M ${x} ${y} L ${x + w - tip} ${y} L ${x + w} ${y + h / 2} L ${x + w - tip} ${y + h} L ${x} ${y + h} Z`
      : `M ${x + tip} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x + tip} ${y + h} L ${x} ${y + h / 2} Z`;
  const lines = Array.isArray(label) ? label : [label];
  const cx =
    direction === "in"
      ? x + (w - tip * 0.5) / 2
      : x + tip * 0.5 + (w - tip * 0.5) / 2;
  return (
    <g>
      <path
        d={d}
        strokeWidth={4}
        strokeLinejoin="round"
        className={`fill-synoptic-plate ${FLUID_STROKE_CLASS[fluid]}`}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={y + h / 2 + (i - (lines.length - 1) / 2) * 22}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={17}
          fontWeight={600}
          className="fill-foreground"
        >
          {line}
        </text>
      ))}
    </g>
  );
}
