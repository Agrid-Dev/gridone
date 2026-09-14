import { describe, expect, it } from "vitest";
import {
  capsulePts,
  circlePts,
  extrude,
  silhouette,
  square,
  visibleArc,
} from "./extrude";

const unit = square(0, 0, 1, 1);

describe("visibleArc", () => {
  it("picks the two front edges of a unit square", () => {
    // Corners project to top (0,0), right (1,0), bottom (1,1), left (0,1).
    expect(visibleArc(unit, 1)).toEqual([3, 2, 1]);
  });

  it("is empty for no points and a single index for one", () => {
    expect(visibleArc([], 1)).toEqual([]);
    expect(visibleArc([{ x: 2, y: 3 }], 1)).toEqual([0]);
  });

  it("keeps the lower half of a circle, walking backwards when needed", () => {
    // Leftmost on screen is index 3, rightmost 7; the front arc runs 3 -> 0 -> 7.
    expect(visibleArc(circlePts({ x: 0, y: 0 }, 1, 8), 0)).toEqual([
      3, 2, 1, 0, 7,
    ]);
  });
});

describe("extrude", () => {
  it("splits the visible side of a square into a y face and an x face", () => {
    const { faces, band, top } = extrude(unit, 0, 1);
    expect(faces.map((f) => f.axis)).toEqual(["y", "x"]);
    expect(faces[0].points).toEqual([
      { x: -40, y: 20 },
      { x: 0, y: 40 },
      { x: 0, y: 0 },
      { x: -40, y: -20 },
    ]);
    expect(faces[1].points).toEqual([
      { x: 0, y: 40 },
      { x: 40, y: 20 },
      { x: 40, y: -20 },
      { x: 0, y: 0 },
    ]);
    expect(band).toEqual([
      { x: -40, y: 20 },
      { x: 0, y: 40 },
      { x: 40, y: 20 },
      { x: 40, y: -20 },
      { x: 0, y: 0 },
      { x: -40, y: -20 },
    ]);
    expect(top).toHaveLength(4);
    expect(top[0]).toEqual({ x: 0, y: -40 });
  });

  it("merges consecutive edges that face the same axis", () => {
    const { faces } = extrude(circlePts({ x: 0.5, y: 0.5 }, 0.45), 0, 2);
    expect(faces).toHaveLength(2);
    expect(faces.map((f) => f.axis)).toEqual(["y", "x"]);
  });

  it("collapses the side faces of a body with no height", () => {
    const { faces } = extrude(unit, 0.4, 0.4);
    for (const face of faces) {
      expect(face.points[0]).toEqual(face.points[3]);
      expect(face.points[1]).toEqual(face.points[2]);
    }
  });
});

describe("silhouette", () => {
  it("wraps the base front and the top back of a square", () => {
    expect(silhouette(unit, 0, 1)).toEqual([
      { x: -40, y: 20 },
      { x: 0, y: 40 },
      { x: 40, y: 20 },
      { x: 40, y: -20 },
      { x: 0, y: -40 },
      { x: -40, y: -20 },
    ]);
  });

  it("closes around a capsule without repeating a point", () => {
    const pts = silhouette(capsulePts({ x: 0.5, y: 0.5 }), 0, 0.8);
    expect(pts).toHaveLength(42 + 2);
  });

  it("is empty for no points", () => {
    expect(silhouette([], 0, 1)).toEqual([]);
  });
});
