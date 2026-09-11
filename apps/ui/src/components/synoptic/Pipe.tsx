import type { Fluid } from "@gridone/sdk";
import { FLUID_FILL_CLASS, FLUID_STROKE_CLASS } from "@/lib/fluidColors";
import { arrowHead, roundedPath, unit } from "./geometry";
import type { Pt } from "./types";

type PipeProps = {
  /** Orthogonal waypoints, first = flow start, last = flow end. */
  points: Pt[];
  fluid: Fluid;
  width?: number;
  /** Corner rounding radius at bends. */
  radius?: number;
  /** Draw a solid arrow head at the last point (flow direction). */
  endArrow?: boolean;
  /** Draw a solid arrow head at the first point (reversed). */
  startArrow?: boolean;
  /** Live flow: a moving dash in the plate colour when true, the pipe dimmed
   *  when false. Omit for a static pipe. The dash stands still under
   *  `prefers-reduced-motion`. */
  flowing?: boolean;
};

const ARROW_LEN = 17;
const ARROW_W = 16;

/** A process pipe: rounded orthogonal polyline with optional flow arrows. */
export function Pipe({
  points,
  fluid,
  width = 6,
  radius = 10,
  endArrow = false,
  startArrow = false,
  flowing,
}: PipeProps) {
  if (points.length < 2) return null;
  const pts = [...points];
  const last = points.length - 1;
  const arrows: string[] = [];

  // Both directions come from the untouched waypoints: capping one end
  // must not move the point the other end is measured against.
  const cap = (tipIdx: number, prevIdx: number) => {
    const tip = points[tipIdx];
    const u = unit(points[prevIdx], tip);
    arrows.push(arrowHead(tip, u, ARROW_LEN, ARROW_W));
    // pull the line back so the stroke doesn't poke past the arrow head
    pts[tipIdx] = {
      x: tip.x - u.x * (ARROW_LEN - 3),
      y: tip.y - u.y * (ARROW_LEN - 3),
    };
  };
  if (endArrow) cap(last, last - 1);
  if (startArrow) cap(0, 1);

  const d = roundedPath(pts, radius);
  return (
    <g opacity={flowing === false ? 0.45 : 1}>
      <path
        d={d}
        fill="none"
        strokeWidth={width}
        className={FLUID_STROKE_CLASS[fluid]}
      />
      {arrows.map((a, i) => (
        <polygon key={i} points={a} className={FLUID_FILL_CLASS[fluid]} />
      ))}
      {flowing && (
        <path
          d={d}
          fill="none"
          strokeWidth={Math.max(2, width * 0.38)}
          strokeDasharray="10 16"
          strokeLinecap="round"
          className="animate-flow stroke-synoptic-plate motion-reduce:animate-none"
        />
      )}
    </g>
  );
}
