import { symbolSchemas, type Cell, type SymbolElement } from "@gridone/sdk";
import { rotateQuarter } from "../projection";
import type { CollectorProps } from "./ports";

/** A rectangle in plan cells, `x1`/`y1` exclusive. */
export type PlanRect = { x0: number; y0: number; x1: number; y1: number };

/** The authored bar of a collector, or null for any other symbol and for
 *  a collector whose props do not describe one: that one then degrades to
 *  the kit's unknown-type cell rather than crashing the plate. */
export function collectorShape(symbol: SymbolElement): CollectorProps | null {
  if (symbol.type !== "collector") return null;
  const props = symbol.props as Partial<CollectorProps> | undefined;
  return props?.axis && props.length ? (props as CollectorProps) : null;
}

/** Footprint of a symbol in cells at rotation 0: the type's, the authored
 *  bar's, or one cell. */
export function footprintSize(symbol: SymbolElement): { w: number; d: number } {
  const footprint = symbolSchemas[symbol.type]?.["x-footprint"];
  const bar = collectorShape(symbol);
  return {
    w: footprint?.w ?? (bar?.axis === "x" ? bar.length : 1),
    d: footprint?.d ?? (bar?.axis === "y" ? bar.length : 1),
  };
}

export const symbolRotation = (symbol: SymbolElement) =>
  symbol.placement.kind === "cell" ? (symbol.placement.rotation ?? 0) : 0;

/** The cells a symbol's footprint covers, turned by its rotation. */
export function footprintCells(symbol: SymbolElement): Cell[] {
  const { w, d } = footprintSize(symbol);
  const origin = symbol.placement.cell;
  const rotation = symbolRotation(symbol);
  const cells: Cell[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < d; y++) {
      const r = rotateQuarter({ x, y }, rotation);
      cells.push({ x: origin.x + r.x, y: origin.y + r.y, z: origin.z });
    }
  }
  return cells;
}

/** The turned footprint as one plan rectangle in world cells. */
export function footprintRect(symbol: SymbolElement): PlanRect {
  const cells = footprintCells(symbol);
  return {
    x0: Math.min(...cells.map((c) => c.x)),
    y0: Math.min(...cells.map((c) => c.y)),
    x1: Math.max(...cells.map((c) => c.x)) + 1,
    y1: Math.max(...cells.map((c) => c.y)) + 1,
  };
}
