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
  /** Live flow: a moving dash in the plate colour when true. The dash
   *  stands still under `prefers-reduced-motion`. Stop state is on the
   *  symbol, never on the pipe, so false and omitted both draw it static. */
  flowing?: boolean;
};

/** The arrow head the visual language draws at the `to` end. */
const ARROW_LEN = 8;
const ARROW_W = 6;
/** Pipe colour and the plate-coloured casing around it, so a run crossing
 *  another at a higher `z` reads as in front. */
export const PIPE_WIDTH = 3;
const CASING_WIDTH = 7;

/** A process pipe: rounded orthogonal polyline with optional flow arrows. */
export function Pipe({
  points,
  fluid,
  width = PIPE_WIDTH,
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
    <g>
      <path
        d={d}
        fill="none"
        strokeWidth={width + CASING_WIDTH - PIPE_WIDTH}
        className="stroke-synoptic-plate"
        data-casing
      />
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
