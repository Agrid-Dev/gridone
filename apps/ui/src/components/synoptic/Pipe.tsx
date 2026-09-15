import type { Fluid } from "@gridone/sdk";
import { fluidFillClass, fluidStrokeClass } from "@/lib/fluidColors";
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

  /** Arrow head at `tipIdx`, pulled back along the end segment so the
   *  stroke does not poke past it. Directions come from the untouched
   *  waypoints so capping one end cannot move the point the other end is
   *  measured against. A segment shorter than the head gets no head: the
   *  pull-back would otherwise run the line past its own origin. */
  const cap = (tipIdx: number, prevIdx: number) => {
    const tip = points[tipIdx];
    const prev = points[prevIdx];
    const segLen = Math.hypot(tip.x - prev.x, tip.y - prev.y);
    if (segLen < ARROW_LEN) return;
    const u = unit(prev, tip);
    arrows.push(arrowHead(tip, u, ARROW_LEN, ARROW_W));
    const pull = Math.min(ARROW_LEN - 3, segLen / 2);
    pts[tipIdx] = { x: tip.x - u.x * pull, y: tip.y - u.y * pull };
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
        className={fluidStrokeClass(fluid)}
      />
      {arrows.map((a, i) => (
        <polygon key={i} points={a} className={fluidFillClass(fluid)} />
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
