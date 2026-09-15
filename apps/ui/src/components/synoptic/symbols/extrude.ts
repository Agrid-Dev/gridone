import { project } from "../projection";
import type { Pt } from "../types";

const iso = (p: Pt, z: number) => project("isometric", p.x, p.y, z);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** `n` points around the circle (c, r), counter-clockwise in plan. */
export function circlePts(c: Pt, r: number, n = 40): Pt[] {
  return Array.from({ length: n }, (_, i) => ({
    x: c.x + r * Math.cos((2 * Math.PI * i) / n),
    y: c.y + r * Math.sin((2 * Math.PI * i) / n),
  }));
}

export function square(x: number, y: number, w: number, d: number): Pt[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + d },
    { x, y: y + d },
  ];
}

/** A stadium standing along `y`: two half-circles of radius `r` joined by
 *  straight sides `2 * dy` long. */
export function capsulePts(c: Pt, r = 0.24, dy = 0.14): Pt[] {
  const arc = Array.from({ length: 21 }, (_, i) => (Math.PI * i) / 20);
  const top = arc.map((t) => ({
    x: c.x + r * Math.cos(t),
    y: c.y - dy - r * Math.sin(t),
  }));
  const bottom = arc.map((t) => ({
    x: c.x - r * Math.cos(t),
    y: c.y + dy + r * Math.sin(t),
  }));
  return [...top, ...bottom];
}

/**
 * Indices of a plan outline's points that face the viewer, leftmost to
 * rightmost on screen: the vertical silhouette edges rise from its ends.
 * Of the two arcs between the extreme points, the lower one on screen is
 * the one the viewer sees.
 */
export function visibleArc(outline: Pt[], z: number): number[] {
  const n = outline.length;
  if (n === 0) return [];
  const proj = outline.map((p) => iso(p, z));
  let li = 0;
  let ri = 0;
  proj.forEach((p, i) => {
    if (p.x < proj[li].x) li = i;
    if (p.x > proj[ri].x) ri = i;
  });
  const walk = (step: number) => {
    const idx: number[] = [];
    let i = li;
    for (;;) {
      idx.push(i);
      if (i === ri) return idx;
      i = (i + step + n) % n;
    }
  };
  const fwd = walk(1);
  const centreY = mean(proj.map((p) => p.y));
  return mean(fwd.map((i) => proj[i].y)) >= centreY ? fwd : walk(-1);
}

export type Face = { axis: "x" | "y"; points: Pt[] };

export type Extrusion = {
  /** Visible side faces, each facing along `x` or `y` so the kit tones
   *  them apart. */
  faces: Face[];
  /** Outline of the whole visible side band. */
  band: Pt[];
  /** The top face. */
  top: Pt[];
};

/** A plan outline given height, from `z0` to `z1`: hidden edges are not
 *  part of the result. */
export function extrude(outline: Pt[], z0: number, z1: number): Extrusion {
  const idx = visibleArc(outline, z1);
  const cx = mean(outline.map((p) => p.x));
  const cy = mean(outline.map((p) => p.y));
  const facing = (a: number, b: number): Face["axis"] => {
    const mx = (outline[a].x + outline[b].x) / 2 - cx;
    const my = (outline[a].y + outline[b].y) / 2 - cy;
    return Math.abs(mx) >= Math.abs(my) ? "x" : "y";
  };
  const runs: { axis: Face["axis"]; idx: number[] }[] = [];
  for (let k = 1; k < idx.length; k++) {
    const axis = facing(idx[k - 1], idx[k]);
    const last = runs[runs.length - 1];
    if (last && last.axis === axis) last.idx.push(idx[k]);
    else runs.push({ axis, idx: [idx[k - 1], idx[k]] });
  }
  const at = (z: number) => (i: number) => iso(outline[i], z);
  return {
    faces: runs.map(({ axis, idx: run }) => ({
      axis,
      points: [...run.map(at(z0)), ...[...run].reverse().map(at(z1))],
    })),
    band: [...idx.map(at(z0)), ...[...idx].reverse().map(at(z1))],
    top: outline.map((p) => iso(p, z1)),
  };
}

/** Outer boundary of an extruded outline on screen: the visible arc at the
 *  base, then the hidden arc at the top, so a fault outline wraps the whole
 *  body and not only its lid. */
export function silhouette(outline: Pt[], z0: number, z1: number): Pt[] {
  const idx = visibleArc(outline, z1);
  const n = outline.length;
  if (idx.length === 0) return [];
  const step = idx.length < 2 || (idx[1] - idx[0] + n) % n === 1 ? 1 : -1;
  const last = idx[idx.length - 1];
  const hidden = Array.from(
    { length: n - idx.length },
    (_, k) => (((last + (k + 1) * step) % n) + n) % n,
  );
  return [
    ...idx.map((i) => iso(outline[i], z0)),
    ...[last, ...hidden, idx[0]].map((i) => iso(outline[i], z1)),
  ];
}
