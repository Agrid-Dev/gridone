import type { Cell } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { axisCentre, runCells } from "@/components/synoptic/runs";
import type { Pt } from "@/components/synoptic/types";
import { runCorners, segmentRule } from "./runRules";

/** A cell an inline symbol can ride, with where it sits on the flat plan
 *  and the way the run goes through it, for the ghost to follow. */
export type Ride = { pipe: string; cell: Cell; centre: Pt; direction: Pt };

const planStep = (a: Cell, b: Cell): Pt => ({
  x: Math.sign(b.x - a.x),
  y: Math.sign(b.y - a.y),
});
const moves = (d: Pt) => d.x !== 0 || d.y !== 0;

/**
 * Every cell of every drawable run where an inline symbol may be dropped:
 * strictly inside the run (the backend refuses an end cell), and not the
 * foot or head of a riser, where the run climbs in place and a symbol
 * would hide under the flat plan's single line.
 */
export function rides(doc: PlateDocument): Ride[] {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const found: Ride[] = [];
  for (const pipe of doc.pipes ?? []) {
    const corners = runCorners(pipe, symbols);
    if (
      !corners ||
      corners.slice(1).some((b, i) => segmentRule(corners[i], b))
    ) {
      continue;
    }
    const cells = runCells(corners);
    const z = (i: number) => cells[i].z ?? 0;
    for (let i = 1; i < cells.length - 1; i++) {
      if (z(i) !== z(i - 1) || z(i) !== z(i + 1)) continue;
      const out = planStep(cells[i], cells[i + 1]);
      found.push({
        pipe: pipe.id,
        cell: cells[i],
        centre: axisCentre("flat", cells[i]),
        direction: moves(out) ? out : planStep(cells[i - 1], cells[i]),
      });
    }
  }
  return found;
}

/** The ride nearest `point` (plate px, flat plan), within `radius` px. */
export function nearestRide(
  candidates: Ride[],
  point: Pt,
  radius: number,
): Ride | null {
  let best: Ride | null = null;
  let bestDistance = radius;
  for (const ride of candidates) {
    const distance = Math.hypot(
      ride.centre.x - point.x,
      ride.centre.y - point.y,
    );
    if (distance <= bestDistance) {
      best = ride;
      bestDistance = distance;
    }
  }
  return best;
}
