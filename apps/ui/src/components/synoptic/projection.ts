import type { Cell, Projection, Side } from "@gridone/sdk";
import type { Pt } from "./types";

/** Isometric (2:1 dimetric) cell vectors in px: `x` right-and-down,
 *  `y` left-and-down, `z` up. A cell is a 48 x 24 diamond: small enough
 *  for a whole bay to fit the page at a text size an operator can read,
 *  since the text does not shrink with the cell. */
const ISO_X = { x: 24, y: 12 };
const ISO_Y = { x: -24, y: 12 };
const ISO_Z = 24;

/** Flat cell size in px: `x` screen-right, `y` screen-down. */
const FLAT_CELL = 40;

/** The angle, in degrees, of the isometric `x` axis on screen; the `y`
 *  axis is its mirror. Text laid along a run or a bar turns by it. */
export const ISO_AXIS_DEG = (Math.atan2(ISO_X.y, ISO_X.x) * 180) / Math.PI;

/** How screen text turns to lie along a plan direction in the isometric
 *  view: `+x` and `-x` read left to right down the `x` axis, `+y` and `-y`
 *  up the `y` axis. Flat text never turns. */
export function axisAngle(projection: Projection, d: Pt): number {
  if (projection === "flat" || (d.x === 0 && d.y === 0)) return 0;
  return Math.abs(d.x) >= Math.abs(d.y) ? ISO_AXIS_DEG : -ISO_AXIS_DEG;
}

/** Screen height of `z` cells in the isometric view. */
export const isoHeight = (z: number) => z * ISO_Z;

/** The ellipse a plan circle of radius `r` cells becomes on the isometric
 *  sheet: the circle's `(r cos t, r sin t)` projects to
 *  `(24 r (cos t - sin t), 12 r (cos t + sin t))`, an ellipse of semi-axes
 *  `24 r sqrt 2` and `12 r sqrt 2`. */
export const isoEllipse = (r: number) => ({
  rx: ISO_X.x * Math.SQRT2 * r,
  ry: ISO_X.y * Math.SQRT2 * r,
});

/** Height of the pipe axis inside a cell, in cells. */
export const PIPE_AXIS_Z = 0.4;

/** How a document with no `projection` is drawn. */
export const DEFAULT_PROJECTION: Projection = "isometric";

/** Screen position of a grid point. Fractional coordinates are allowed:
 *  `(x + 0.5, y + 0.5)` is a cell centre. Flat ignores `z`. */
export function project(
  projection: Projection,
  x: number,
  y: number,
  z = 0,
): Pt {
  if (projection === "flat") return { x: x * FLAT_CELL, y: y * FLAT_CELL };
  return {
    x: x * ISO_X.x + y * ISO_Y.x,
    y: x * ISO_X.y + y * ISO_Y.y - z * ISO_Z,
  };
}

/** The grid point under a screen position, at height `z`: the inverse of
 *  `project`. Fractional; the cell is its floor. Flat ignores `z`. */
export function unproject(projection: Projection, p: Pt, z = 0): Pt {
  if (projection === "flat") return { x: p.x / FLAT_CELL, y: p.y / FLAT_CELL };
  const sum = (p.y + z * ISO_Z) / ISO_X.y;
  const diff = p.x / ISO_X.x;
  return { x: (sum + diff) / 2, y: (sum - diff) / 2 };
}

/** What an element is, for the draw order within one cell. */
export type Layer = "pipe" | "symbol" | "label";

/** Within a cell a pipe paints under the symbol riding it. */
const LAYER_RANK: Record<Exclude<Layer, "label">, number> = {
  pipe: 0,
  symbol: 1,
};
const LAYER_COUNT = Object.keys(LAYER_RANK).length;
/** Labels paint in a pass above every cell: a chip or panel hangs outside
 *  the cell it belongs to, so a rank inside the cell sum would let a
 *  nearer body cover it. No plate reaches a cell sum this large. */
const LABEL_PASS = 1_000_000;

/**
 * Painter's order of an element at `cell`: draw ascending.
 *
 * In the isometric projection the viewer looks down the `-x -y -z`
 * diagonal, so a unit cell further along `x + y + z` is nearer and must be
 * painted later. A pipe run is keyed per cell it crosses: one key cannot
 * hold for a run that passes behind one body and in front of the next.
 * Within a cell the layer decides: a pipe under the symbol riding it.
 * Labels, chips and panels come after every cell, ordered by their own
 * cell among themselves.
 */
export function depthKey(cell: Cell, layer: Layer): number {
  const sum = cell.x + cell.y + (cell.z ?? 0);
  if (layer === "label") return LABEL_PASS + sum;
  return sum * LAYER_COUNT + LAYER_RANK[layer];
}

/** Plan-to-screen mapping of a horizontal plane: `z` cells up in the
 *  isometric projection, the sheet itself in flat. Plan coordinates are
 *  cells. */
export type Plane = (x: number, y: number) => Pt;

export function planeAt(projection: Projection, z: number): Plane {
  return (x, y) => project(projection, x, y, z);
}

/** `turns` quarter turns counter-clockwise about the origin cell, in the
 *  xy plane: `(x, y) -> (-y, x)`. Same rule as the backend's port rotation. */
export function rotateQuarter(p: Pt, turns: number): Pt {
  let { x, y } = p;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [x, y] = [-y, x];
  // `|| 0` turns the -0 a negation leaves into 0.
  return { x: x || 0, y: y || 0 };
}

const SIDE_VECTORS: Record<Side, Pt & { z: number }> = {
  "+x": { x: 1, y: 0, z: 0 },
  "-x": { x: -1, y: 0, z: 0 },
  "+y": { x: 0, y: 1, z: 0 },
  "-y": { x: 0, y: -1, z: 0 },
  "+z": { x: 0, y: 0, z: 1 },
  "-z": { x: 0, y: 0, z: -1 },
};

/** The unit step out of a cell through `side`. */
export function sideVector(side: Side): Pt & { z: number } {
  return SIDE_VECTORS[side];
}

/** Where each face goes after one quarter turn counter-clockwise; the
 *  vertical faces stay put. */
const NEXT_SIDE: Record<Side, Side> = {
  "+x": "+y",
  "+y": "-x",
  "-x": "-y",
  "-y": "+x",
  "+z": "+z",
  "-z": "-z",
};

/** The face `side` becomes after `turns` quarter turns. */
export function rotateSide(side: Side, turns: number): Side {
  let s = side;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) s = NEXT_SIDE[s];
  return s;
}

/** Screen point where a pipe meets a cell: the centre of its `side` face,
 *  on the pipe axis. */
export function portPoint(projection: Projection, cell: Cell, side: Side): Pt {
  const v = sideVector(side);
  return project(
    projection,
    cell.x + 0.5 + v.x / 2,
    cell.y + 0.5 + v.y / 2,
    (cell.z ?? 0) + PIPE_AXIS_Z + v.z / 2,
  );
}
