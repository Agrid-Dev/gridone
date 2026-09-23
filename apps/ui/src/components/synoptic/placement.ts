import type { Pt } from "./types";

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Two placed things stay this far apart. */
export const CLEARANCE = 4;

export const bounds = (points: Pt[]): Box => ({
  x0: Math.min(...points.map((p) => p.x)),
  y0: Math.min(...points.map((p) => p.y)),
  x1: Math.max(...points.map((p) => p.x)),
  y1: Math.max(...points.map((p) => p.y)),
});

/** A run's piece: the line it draws, `r` px to either side. A box is a
 *  poor stand-in for a diagonal run, since most of its area is empty
 *  plate, so runs are kept as what they are. */
export type Segment = { a: Pt; b: Pt; r: number };

export type Obstacle = Box | Segment;

export const isSegment = (o: Obstacle): o is Segment => "a" in o;

const boxesOverlap = (a: Box, b: Box) =>
  a.x0 < b.x1 + CLEARANCE &&
  b.x0 < a.x1 + CLEARANCE &&
  a.y0 < b.y1 + CLEARANCE &&
  b.y0 < a.y1 + CLEARANCE;

/**
 * Whether the segment comes within `margin` of `box`: Liang-Barsky, the
 * segment clipped against the box grown by the margin. A segment that
 * starts inside, ends inside or crosses the grown box hits it.
 */
export function segmentHitsBox(
  { a, b, r }: Segment,
  box: Box,
  margin: number,
): boolean {
  const m = r + margin;
  const bounds = [
    [-(b.x - a.x), a.x - (box.x0 - m)],
    [b.x - a.x, box.x1 + m - a.x],
    [-(b.y - a.y), a.y - (box.y0 - m)],
    [b.y - a.y, box.y1 + m - a.y],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of bounds) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t0 <= t1;
}

/** Whether `box` comes within `CLEARANCE` of an obstacle. */
export const overlaps = (box: Box, o: Obstacle) =>
  isSegment(o) ? segmentHitsBox(o, box, CLEARANCE) : boxesOverlap(box, o);

/** Where a box may go from what it hangs off, on screen. */
export type Direction = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";

const VECTOR: Record<Direction, Pt> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  NE: { x: 1, y: -1 },
  NW: { x: -1, y: -1 },
  SE: { x: 1, y: 1 },
  SW: { x: -1, y: 1 },
};

/** A box `w` by `h` set `distance` px off `around` towards `direction`:
 *  its nearest edge that far from the nearest edge of `around`, centred
 *  on it along the other axis; a diagonal spot clears the corner by the
 *  distance on both axes. */
export function boxAt(
  around: Box,
  direction: Direction,
  distance: number,
  w: number,
  h: number,
): Box {
  const v = VECTOR[direction];
  const cx = (around.x0 + around.x1) / 2;
  const cy = (around.y0 + around.y1) / 2;
  const x0 =
    v.x < 0
      ? around.x0 - distance - w
      : v.x > 0
        ? around.x1 + distance
        : cx - w / 2;
  const y0 =
    v.y < 0
      ? around.y0 - distance - h
      : v.y > 0
        ? around.y1 + distance
        : cy - h / 2;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

export type Spot = { box: Box; direction: Direction; ring: number };

/** What each step down the preference order costs, in px of distance: a
 *  spot on the preferred side a ring further out beats one on the fourth
 *  side close by, and the nearest spot wins otherwise. */
export const DIRECTION_PENALTY = 8;

/**
 * The best spot clear of every obstacle for a `w` by `h` box around
 * `around`: `start` px off, then each ring `step` px further out, up to
 * `rings` rings, in the directions given. Spots are ranked by distance
 * plus `DIRECTION_PENALTY` per step down the order, so text stays close
 * and on the side it prefers when both are had. The search is the same
 * for a tag on a run (a point, as a box of no size) and a readout beside
 * a body, so a plate places all its text one way. Null when every spot
 * of every ring is taken.
 */
export function findSpot(
  around: Box,
  w: number,
  h: number,
  obstacles: Obstacle[],
  order: Direction[],
  start: number,
  step: number,
  rings: number,
): Spot | null {
  const candidates: { ring: number; direction: Direction; cost: number }[] = [];
  for (let ring = 0; ring < rings; ring++) {
    order.forEach((direction, i) => {
      candidates.push({
        ring,
        direction,
        cost: start + ring * step + i * DIRECTION_PENALTY,
      });
    });
  }
  candidates.sort((a, b) => a.cost - b.cost);
  for (const { ring, direction } of candidates) {
    const box = boxAt(around, direction, start + ring * step, w, h);
    if (!obstacles.some((o) => overlaps(box, o))) {
      return { box, direction, ring };
    }
  }
  return null;
}

/** The point of `box`'s edge nearest to `p`: where a leader leaves it. */
export function edgePoint(box: Box, p: Pt): Pt {
  return {
    x: Math.min(Math.max(p.x, box.x0), box.x1),
    y: Math.min(Math.max(p.y, box.y0), box.y1),
  };
}

/** The point of `points` nearest to `to`. */
export const nearest = (points: Pt[], to: Pt): Pt =>
  points.reduce((best, p) =>
    Math.hypot(p.x - to.x, p.y - to.y) <
    Math.hypot(best.x - to.x, best.y - to.y)
      ? p
      : best,
  );
