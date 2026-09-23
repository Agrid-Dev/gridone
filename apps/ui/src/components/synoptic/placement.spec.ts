import { describe, expect, it } from "vitest";
import {
  bounds,
  boxAt,
  CLEARANCE,
  DIRECTION_PENALTY,
  edgePoint,
  findSpot,
  isSegment,
  nearest,
  overlaps,
  segmentHitsBox,
  type Box,
  type Direction,
  type Obstacle,
  type Segment,
} from "./placement";

const BOX: Box = { x0: 40, y0: 40, x1: 60, y1: 60 };
const seg = (a: [number, number], b: [number, number], r = 0): Segment => ({
  a: { x: a[0], y: a[1] },
  b: { x: b[0], y: b[1] },
  r,
});

describe("segmentHitsBox", () => {
  it("hits a box the segment crosses, straight or askew", () => {
    expect(segmentHitsBox(seg([0, 50], [100, 50]), BOX, 0)).toBe(true);
    expect(segmentHitsBox(seg([0, 0], [100, 100]), BOX, 0)).toBe(true);
  });

  it("hits a box either end lies in, and one holding the whole segment", () => {
    expect(segmentHitsBox(seg([50, 50], [200, 200]), BOX, 0)).toBe(true);
    expect(segmentHitsBox(seg([-100, -100], [50, 50]), BOX, 0)).toBe(true);
    expect(segmentHitsBox(seg([45, 45], [55, 55]), BOX, 0)).toBe(true);
  });

  it("misses a parallel segment until the margin, plus the segment's own radius, reaches it", () => {
    // 10 px below the box's bottom edge, running past it.
    const below = seg([0, 70], [100, 70]);
    expect(segmentHitsBox(below, BOX, 9)).toBe(false);
    expect(segmentHitsBox(below, BOX, 10)).toBe(true);
    // A run 5 px to either side of its line needs only 5 px of margin.
    expect(segmentHitsBox(seg([0, 70], [100, 70], 5), BOX, 4)).toBe(false);
    expect(segmentHitsBox(seg([0, 70], [100, 70], 5), BOX, 5)).toBe(true);
  });

  it("misses a segment that stops short of the box along its own line", () => {
    const short = seg([0, 50], [30, 50]);
    expect(segmentHitsBox(short, BOX, 9)).toBe(false);
    expect(segmentHitsBox(short, BOX, 10)).toBe(true);
  });

  it("is a point test for a zero-length segment", () => {
    expect(segmentHitsBox(seg([50, 50], [50, 50]), BOX, 0)).toBe(true);
    expect(segmentHitsBox(seg([70, 50], [70, 50]), BOX, 0)).toBe(false);
    expect(segmentHitsBox(seg([70, 50], [70, 50]), BOX, 10)).toBe(true);
  });

  it("ignores a diagonal whose bounding box overlaps the box but whose line passes by", () => {
    // The line y = x runs from (0,0) to (100,100); the box sits under it,
    // x in [60, 100], y in [0, 30], where the line is at y >= 60. Their
    // bounding boxes overlap on both axes, which is the whole point of
    // keeping a run as a segment rather than a box.
    const line = seg([0, 0], [100, 100]);
    const under: Box = { x0: 60, y0: 0, x1: 100, y1: 30 };
    expect(segmentHitsBox(line, under, 0)).toBe(false);
    // The margin grows the box square, so its corner (60 - m, 30 + m)
    // reaches the line at m = 15, not at the 21 px the corner lies from
    // the line as the crow flies.
    expect(segmentHitsBox(line, under, 14)).toBe(false);
    expect(segmentHitsBox(line, under, 15)).toBe(true);
  });
});

describe("overlaps", () => {
  const box: Box = { x0: 0, y0: 0, x1: 10, y1: 10 };

  it("tells a segment from a box", () => {
    expect(isSegment(seg([0, 0], [1, 1]))).toBe(true);
    expect(isSegment(box)).toBe(false);
  });

  it("keeps two boxes CLEARANCE apart on either axis", () => {
    expect(CLEARANCE).toBe(4);
    expect(overlaps(box, { x0: 13.9, y0: 0, x1: 20, y1: 10 })).toBe(true);
    expect(overlaps(box, { x0: 14, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(overlaps(box, { x0: 0, y0: 13.9, x1: 10, y1: 20 })).toBe(true);
    expect(overlaps(box, { x0: 0, y0: 14, x1: 10, y1: 20 })).toBe(false);
    // Apart on one axis is apart, however close on the other.
    expect(overlaps(box, { x0: 2, y0: 14, x1: 8, y1: 20 })).toBe(false);
  });

  it("reads a run as its line, its half width and the clearance", () => {
    // A 10 px wide run (r 5) must keep its edge 4 px off the box: its
    // line stays 9 px away.
    expect(overlaps(box, seg([-50, 18.9], [50, 18.9], 5))).toBe(true);
    expect(overlaps(box, seg([-50, 19.1], [50, 19.1], 5))).toBe(false);
    // A diagonal run whose bounding box covers the box but whose line
    // passes the grown corner (19, 19) by: x + y = 40 never reaches it.
    expect(overlaps(box, seg([0, 40], [40, 0], 5))).toBe(false);
    expect(overlaps(box, seg([0, 30], [30, 0], 5))).toBe(true);
  });
});

describe("boxAt", () => {
  const around: Box = { x0: 0, y0: 0, x1: 10, y1: 20 };

  // A 4 x 2 box 5 px off a 10 x 20 one: the nearest edges 5 apart,
  // centred on the other axis, and a corner spot 5 off on both.
  it.each<[Direction, Box]>([
    ["N", { x0: 3, y0: -7, x1: 7, y1: -5 }],
    ["S", { x0: 3, y0: 25, x1: 7, y1: 27 }],
    ["E", { x0: 15, y0: 9, x1: 19, y1: 11 }],
    ["W", { x0: -9, y0: 9, x1: -5, y1: 11 }],
    ["NE", { x0: 15, y0: -7, x1: 19, y1: -5 }],
    ["NW", { x0: -9, y0: -7, x1: -5, y1: -5 }],
    ["SE", { x0: 15, y0: 25, x1: 19, y1: 27 }],
    ["SW", { x0: -9, y0: 25, x1: -5, y1: 27 }],
  ])("sets the box %s of what it hangs off", (direction, expected) => {
    expect(boxAt(around, direction, 5, 4, 2)).toEqual(expected);
  });

  it("hangs a tag's box off a point, as a box of no size", () => {
    const point: Box = { x0: 50, y0: 50, x1: 50, y1: 50 };
    expect(boxAt(point, "N", 26, 36, 45)).toEqual({
      x0: 32,
      y0: -21,
      x1: 68,
      y1: 24,
    });
  });
});

describe("findSpot", () => {
  const around: Box = { x0: 0, y0: 0, x1: 10, y1: 10 };
  const order: Direction[] = ["N", "E", "W", "S"];
  const spot = (obstacles: Obstacle[]) =>
    findSpot(around, 4, 2, obstacles, order, 10, 12, 3);
  /** Covers the spot north of the body on the first ring, not the second. */
  const overNorth: Box = { x0: 0, y0: -14, x1: 10, y1: -9 };
  /** Covers the spot east of the body on the first ring, not the second. */
  const overEast: Box = { x0: 18, y0: 0, x1: 26, y1: 10 };

  it("takes the nearest spot on the preferred side when it is clear", () => {
    expect(spot([])).toEqual({
      box: { x0: 3, y0: -12, x1: 7, y1: -10 },
      direction: "N",
      ring: 0,
    });
  });

  it("prefers the second side close by to the first side a ring further out", () => {
    // One step down the order costs 8 px, a ring 12: 18 beats 22.
    expect(DIRECTION_PENALTY).toBe(8);
    expect(spot([overNorth])).toEqual({
      box: { x0: 20, y0: 4, x1: 24, y1: 6 },
      direction: "E",
      ring: 0,
    });
  });

  it("prefers the first side a ring further out to the third side close by", () => {
    // Two steps down the order cost 16 px, more than the 12 of a ring.
    expect(spot([overNorth, overEast])).toEqual({
      box: { x0: 3, y0: -24, x1: 7, y1: -22 },
      direction: "N",
      ring: 1,
    });
  });

  it("is null once every spot of every ring is taken", () => {
    expect(spot([{ x0: -100, y0: -100, x1: 100, y1: 100 }])).toBeNull();
  });

  it("takes a run as the line it draws, so a diagonal's empty corners stay free", () => {
    // A run through the north spot, and a diagonal from (20, 20) to
    // (40, 0) whose bounding box covers the east spot while its line,
    // x + y = 40, passes the spot's grown corner (28, 10) by.
    const north = seg([0, -11], [10, -11]);
    const diagonal = seg([20, 20], [40, 0]);
    expect(spot([north, diagonal])?.direction).toBe("E");
    // The same diagonal taken as a box would have blocked the east spot.
    expect(spot([north, bounds([diagonal.a, diagonal.b])])?.direction).toBe(
      "N",
    );
  });
});

describe("edgePoint", () => {
  const box: Box = { x0: 10, y0: 10, x1: 30, y1: 20 };

  it("is the point of the edge nearest to a point outside, and the point itself inside", () => {
    expect(edgePoint(box, { x: 50, y: 15 })).toEqual({ x: 30, y: 15 });
    expect(edgePoint(box, { x: 20, y: 100 })).toEqual({ x: 20, y: 20 });
    expect(edgePoint(box, { x: 0, y: 0 })).toEqual({ x: 10, y: 10 });
    expect(edgePoint(box, { x: 20, y: 15 })).toEqual({ x: 20, y: 15 });
  });
});

describe("nearest", () => {
  it("picks the closest point, the first of equals", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 3, y: 4 },
    ];
    expect(nearest(points, { x: 4, y: 4 })).toBe(points[2]);
    expect(nearest(points.slice(0, 2), { x: 5, y: 0 })).toBe(points[0]);
    expect(nearest([points[1]], { x: 0, y: 0 })).toBe(points[1]);
  });
});

describe("bounds", () => {
  it("frames every point", () => {
    expect(
      bounds([
        { x: 3, y: 9 },
        { x: -1, y: 2 },
        { x: 5, y: 5 },
      ]),
    ).toEqual({ x0: -1, y0: 2, x1: 5, y1: 9 });
  });
});
