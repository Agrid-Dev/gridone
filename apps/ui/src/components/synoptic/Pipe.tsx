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
  /** Draw the flow chevrons at the last point (flow direction). */
  endArrow?: boolean;
  /** Draw the flow chevrons at the first point (reversed). */
  startArrow?: boolean;
  /** The fluid is moving: a dash in the plate colour runs from the first
   *  point to the last. It stands still under `prefers-reduced-motion`,
   *  still marking the run. */
  flowing?: boolean;
  /** How far along its run this piece starts, in px, so the dash of a run
   *  cut per cell carries on from piece to piece instead of restarting. */
  phase?: number;
  /** The id of the run the piece belongs to, for whoever reads the plate
   *  back (a test, a probe). */
  run?: string;
};

/** The chevron the visual language draws at the `to` end: a filled head
 *  outlined in the plate colour so it stands off the run. */
const ARROW_LEN = 9;
const ARROW_W = 9;
/** Pipe colour and the plate-coloured casing around it, so a run crossing
 *  another at a higher `z` reads as in front. */
export const PIPE_WIDTH = 6;
const CASING_WIDTH = 10;
/** A bend is barely rounded: a pipe corner is an elbow, not a curve. */
const BEND_RADIUS = 4;
/** The moving dash: 10 px on, 16 off, travelling `FLOW_TRAVEL` px every
 *  `FLOW_SECONDS` (the `flow` keyframes of `tailwind.config.js`). */
const FLOW_DASH = 10;
const FLOW_GAP = 16;
const FLOW_TRAVEL = 52;
const FLOW_SECONDS = 1.2;

/** Where a piece's dash pattern starts, `phase` px along its run: the
 *  pattern repeats every dash + gap, so only the remainder counts. The
 *  still dash (reduced motion) is offset by it. */
export const flowShift = (phase: number) => {
  const period = FLOW_DASH + FLOW_GAP;
  return ((phase % period) + period) % period;
};

/** The animation delay that shifts a moving dash by the same amount, taken
 *  below zero so the piece is mid-cycle from its first frame. */
export const flowDelay = (phase: number) =>
  ((flowShift(phase) - FLOW_DASH - FLOW_GAP) * FLOW_SECONDS) / FLOW_TRAVEL;

/** A process pipe: orthogonal polyline with sharp elbows, a casing and
 *  optional flow chevrons. */
export function Pipe({
  points,
  fluid,
  width = PIPE_WIDTH,
  radius = BEND_RADIUS,
  endArrow = false,
  startArrow = false,
  flowing,
  phase = 0,
  run,
}: PipeProps) {
  if (points.length < 2) return null;
  const pts = [...points];
  const last = points.length - 1;
  const arrows: string[] = [];

  /** Chevron at `tipIdx`, pulled back along the end segment so the
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
    <g data-run={run}>
      <path
        d={d}
        fill="none"
        strokeWidth={width + CASING_WIDTH - PIPE_WIDTH}
        strokeLinejoin="round"
        className="stroke-synoptic-plate"
        data-casing
      />
      <path
        d={d}
        fill="none"
        strokeWidth={width}
        strokeLinejoin="round"
        className={fluidStrokeClass(fluid)}
      />
      {arrows.map((a, i) => (
        <polygon
          key={i}
          points={a}
          strokeWidth={1.5}
          strokeLinejoin="round"
          className={`${fluidFillClass(fluid)} stroke-synoptic-plate`}
        />
      ))}
      {flowing && (
        <path
          d={d}
          fill="none"
          strokeWidth={Math.max(2, width * 0.38)}
          strokeDasharray={`${FLOW_DASH} ${FLOW_GAP}`}
          strokeLinecap="round"
          strokeDashoffset={flowShift(phase)}
          style={{ animationDelay: `${flowDelay(phase)}s` }}
          className="animate-flow stroke-synoptic-plate motion-reduce:animate-none"
          data-flow
        />
      )}
    </g>
  );
}
