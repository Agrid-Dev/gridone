import type { SymbolElement } from "@gridone/sdk";
import { footprintRect, type PlanRect } from "./symbols/footprint";

/** Symbols closer than this many cells, edge to edge, stand on one slab. */
export const SLAB_GAP = 3;
/** How far a slab extends past the footprints it carries, in cells. */
export const SLAB_PAD = 0.7;

/** What stands on a slab: every drawn machine, whether free on the grid
 *  or riding a run. Bars and off-page connectors are not equipment. */
const ON_SLAB = new Set([
  "heat_pump",
  "tank",
  "plate_exchanger",
  "pump",
  "pump_double",
  "valve_isolation",
  "valve_control",
  "valve_check",
  "mixing_valve",
  "air_separator",
  "dirt_separator",
  "expansion_vessel",
  "energy_meter",
  "loop_heater",
]);

const overlaps = (a: PlanRect, b: PlanRect, gap: number) =>
  a.x0 < b.x1 + gap &&
  b.x0 < a.x1 + gap &&
  a.y0 < b.y1 + gap &&
  b.y0 < a.y1 + gap;

const union = (a: PlanRect, b: PlanRect): PlanRect => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

/**
 * The slabs a plate stands its equipment on: the format knows no zone, so
 * a group is read off the drawing. Two machines closer than `SLAB_GAP`
 * cells share a slab, and a slab reaches `SLAB_PAD` past the machines it
 * carries. Machines on the floor only: a run raised over a bar carries
 * nothing. The slabs come out in reading order, back to front.
 */
export function slabsOf(symbols: Iterable<SymbolElement>): PlanRect[] {
  const rects: PlanRect[] = [];
  for (const symbol of symbols) {
    if (!ON_SLAB.has(symbol.type)) continue;
    if ((symbol.placement.cell.z ?? 0) !== 0) continue;
    rects.push(footprintRect(symbol));
  }
  // Union-find by repeated merging: a plate holds tens of machines, not
  // thousands, so the quadratic pass is nothing.
  const groups: PlanRect[][] = [];
  for (const rect of rects) {
    const near = groups.filter((g) =>
      g.some((r) => overlaps(r, rect, SLAB_GAP)),
    );
    const merged = [rect, ...near.flat()];
    for (const g of near) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  const padded = groups.map((g) => {
    const box = g.reduce(union);
    return {
      x0: box.x0 - SLAB_PAD,
      y0: box.y0 - SLAB_PAD,
      x1: box.x1 + SLAB_PAD,
      y1: box.y1 + SLAB_PAD,
    };
  });
  // A group's frame reaches past its machines: a lone machine three cells
  // from every member can still stand under the frame's corner. Two slabs
  // that overlap are one slab, so no lip is ever drawn across another.
  return mergeOverlapping(padded).sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0));
}

/** Rectangles merged by union until no two overlap. */
function mergeOverlapping(rects: PlanRect[]): PlanRect[] {
  const merged = [...rects];
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      if (overlaps(merged[i], merged[j], 0)) {
        merged[i] = union(merged[i], merged[j]);
        merged.splice(j, 1);
        // The union may reach rectangles already passed: start the scan over.
        i = -1;
        break;
      }
    }
  }
  return merged;
}
