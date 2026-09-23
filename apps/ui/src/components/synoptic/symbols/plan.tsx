import type { Plane } from "../projection";
import type { Pt } from "../types";
import { circlePts } from "./extrude";

/** The three line tiers of the visual language, the solid fill a closed
 *  valve takes, and the plate-coloured patch that occludes a run under a
 *  glyph without adding a line of its own. */
export type PlanClass = "face" | "outline" | "detail" | "fill" | "plate";

const CLASS: Record<PlanClass, string> = {
  face: "fill-synoptic-body stroke-synoptic-stroke",
  outline: "fill-none stroke-synoptic-stroke",
  detail: "fill-none stroke-muted-foreground",
  fill: "fill-synoptic-stroke stroke-synoptic-stroke",
  plate: "fill-synoptic-plate stroke-none",
};

const WIDTH: Record<PlanClass, number> = {
  face: 2,
  outline: 2,
  detail: 1.25,
  fill: 2,
  plate: 0,
};

const round = (v: number) => Math.round(v * 100) / 100;

/** SVG `points` attribute of screen points, rounded so float noise never
 *  reaches the DOM. */
export const pointsAttr = (pts: Pt[]) =>
  pts.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");

export const toPoints = (plane: Plane, pts: Pt[]) =>
  pointsAttr(pts.map((p) => plane(p.x, p.y)));

type PolyProps = { plane: Plane; points: Pt[]; cls?: PlanClass };

/** A closed plan polygon drawn on `plane`. */
export function PlanPoly({ plane, points, cls = "outline" }: PolyProps) {
  return (
    <polygon
      points={toPoints(plane, points)}
      strokeWidth={WIDTH[cls]}
      strokeLinejoin="round"
      strokeLinecap="round"
      className={CLASS[cls]}
    />
  );
}

type LineProps = { plane: Plane; a: Pt; b: Pt; cls?: PlanClass };

export function PlanLine({ plane, a, b, cls = "detail" }: LineProps) {
  const p = plane(a.x, a.y);
  const q = plane(b.x, b.y);
  return (
    <line
      x1={p.x}
      y1={p.y}
      x2={q.x}
      y2={q.y}
      strokeWidth={WIDTH[cls]}
      strokeLinecap="round"
      className={CLASS[cls]}
    />
  );
}

type CircleProps = { plane: Plane; c: Pt; r: number; cls?: PlanClass };

export function PlanCircle({ plane, c, r, cls = "outline" }: CircleProps) {
  return <PlanPoly plane={plane} points={circlePts(c, r)} cls={cls} />;
}

type TextProps = { plane: Plane; at: Pt; text: string; size?: number };

/** A letter or two inside a glyph (the `M` of an actuator): glyph detail,
 *  not operating information, so it may sit under the 11 px floor. */
export function PlanText({ plane, at, text, size = 8 }: TextProps) {
  const p = plane(at.x, at.y);
  return (
    <text
      x={p.x}
      y={p.y + size * 0.36}
      textAnchor="middle"
      fontSize={size}
      fontWeight={600}
      className="fill-synoptic-stroke"
      data-glyph-text={text}
    >
      {text}
    </text>
  );
}

/** Points authored for a run along `+x`, turned to follow direction `d`
 *  about `c`. */
export function rot(points: Pt[], c: Pt, d: Pt): Pt[] {
  return points.map((p) => ({
    x: c.x + p.x * d.x - p.y * d.y,
    y: c.y + p.x * d.y + p.y * d.x,
  }));
}
