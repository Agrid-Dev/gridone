import { arrowHead, roundedPath, unit } from "./geometry";
import type { Pt } from "./types";

type PipeProps = {
  /** Orthogonal waypoints, first = flow start, last = flow end. */
  points: Pt[];
  color: string;
  width?: number;
  /** Corner rounding radius at bends. */
  radius?: number;
  /** Draw a solid arrow head at the last point (flow direction). */
  endArrow?: boolean;
  /** Draw a solid arrow head at the first point (reversed). */
  startArrow?: boolean;
};

const ARROW_LEN = 17;
const ARROW_W = 16;

/** A process pipe: rounded orthogonal polyline with optional flow arrows. */
export function Pipe({
  points,
  color,
  width = 6,
  radius = 10,
  endArrow = false,
  startArrow = false,
}: PipeProps) {
  if (points.length < 2) return null;
  const pts = points.map((p) => ({ ...p }));
  const arrows: string[] = [];

  if (endArrow) {
    const tip = pts[pts.length - 1];
    const u = unit(pts[pts.length - 2], tip);
    arrows.push(arrowHead(tip, u, ARROW_LEN, ARROW_W));
    // pull the line back so the stroke doesn't poke past the arrow head
    pts[pts.length - 1] = {
      x: tip.x - u.x * (ARROW_LEN - 3),
      y: tip.y - u.y * (ARROW_LEN - 3),
    };
  }
  if (startArrow) {
    const tip = pts[0];
    const u = unit(pts[1], tip);
    arrows.push(arrowHead(tip, u, ARROW_LEN, ARROW_W));
    pts[0] = {
      x: tip.x - u.x * (ARROW_LEN - 3),
      y: tip.y - u.y * (ARROW_LEN - 3),
    };
  }

  return (
    <g>
      <path
        d={roundedPath(pts, radius)}
        fill="none"
        stroke={color}
        strokeWidth={width}
      />
      {arrows.map((a, i) => (
        <polygon key={i} points={a} fill={color} />
      ))}
    </g>
  );
}
