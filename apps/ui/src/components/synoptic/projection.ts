import type { Cell, Projection } from "@gridone/sdk";
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
