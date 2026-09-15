import type { Cell, Projection, Side } from "@gridone/sdk";
import type { Pt } from "./types";

/** Isometric (2:1 dimetric) cell vectors in px: `x` right-and-down,
 *  `y` left-and-down, `z` up. A cell is an 80 x 40 diamond. */
const ISO_X = { x: 40, y: 20 };
const ISO_Y = { x: -40, y: 20 };
const ISO_Z = 40;

/** Flat cell size in px: `x` screen-right, `y` screen-down. */
const FLAT_CELL = 48;

/** Height of the pipe axis inside a cell, in cells. */
export const PIPE_AXIS_Z = 0.4;

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

/** What an element is, for the draw order within one cell. */
export type Layer = "pipe" | "symbol" | "label";

const LAYER_RANK: Record<Layer, number> = { pipe: 0, symbol: 1, label: 2 };
const LAYER_COUNT = Object.keys(LAYER_RANK).length;

/**
 * Painter's order of an element at `cell`: draw ascending.
 *
 * In the isometric projection the viewer looks down the `-x -y -z`
 * diagonal, so a unit cell further along `x + y + z` is nearer and must be
 * painted later. A pipe run is keyed per cell it crosses: one key cannot
 * hold for a run that passes behind one body and in front of the next.
 * Within a cell the layer decides: a pipe under the symbol riding it, tags
 * and labels on top of everything.
 */
export function depthKey(cell: Cell, layer: Layer): number {
  return (cell.x + cell.y + (cell.z ?? 0)) * LAYER_COUNT + LAYER_RANK[layer];
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
