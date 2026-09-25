import type { Cell } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { runCells } from "@/components/synoptic/runs";
import { footprintCells } from "@/components/synoptic/symbols/footprint";
import { cellKey, portAnchorOf, runCorners, segmentRule } from "./runRules";

/** Cells by their owner's id. Keep the height until the caller explicitly
 *  projects to the plan: an overhead crossing is not a physical collision. */
export type Occupancy = {
  bodies: Map<string, Cell[]>;
  runs: Map<string, Cell[]>;
  riders: Map<string, Cell>;
};

/** Resolve the bodies, drawable runs and inline symbols once, so placement,
 *  snapping and routing all consult the same geometry. Invalid polylines
 *  have no occupied run cells, just as in the backend's overlap pass. */
export function occupancyOf(doc: PlateDocument): Occupancy {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const bodies = new Map<string, Cell[]>();
  const riders = new Map<string, Cell>();
  for (const symbol of symbols.values()) {
    if (symbol.placement.kind === "cell") {
      bodies.set(symbol.id, footprintCells(symbol));
    } else {
      riders.set(symbol.id, symbol.placement.cell);
    }
  }
  const runs = new Map<string, Cell[]>();
  for (const pipe of doc.pipes ?? []) {
    const corners = runCorners(pipe, symbols);
    if (
      corners &&
      !corners.slice(1).some((b, i) => segmentRule(corners[i], b))
    ) {
      runs.set(pipe.id, runCells(corners));
    }
  }
  return { bodies, runs, riders };
}

export const pipePairKey = (a: string, b: string): string =>
  JSON.stringify([a, b].sort());

/** Intentional shared cells by pipe pair, matching validation.overlaps:
 *  a tee excuses its branch and trunk only; a port cell excuses only runs
 *  attached there. An unrelated third pipe still collides at that cell. */
export function pipeMeetings(doc: PlateDocument): Map<string, Set<string>> {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const attached = new Map<string, Set<string>>();
  const meetings = new Map<string, Set<string>>();
  const add = (a: string, b: string, cell: string) => {
    const pair = pipePairKey(a, b);
    const cells = meetings.get(pair) ?? new Set<string>();
    cells.add(cell);
    meetings.set(pair, cells);
  };
  for (const pipe of doc.pipes ?? []) {
    for (const end of [pipe.from, pipe.to]) {
      if (end.kind === "pipe") add(pipe.id, end.pipe, cellKey(end.cell));
      if (end.kind !== "port") continue;
      const anchor = portAnchorOf(end, symbols);
      if (!anchor) continue;
      const key = cellKey(anchor.cell);
      const ids = attached.get(key) ?? new Set<string>();
      for (const id of ids) add(id, pipe.id, key);
      ids.add(pipe.id);
      attached.set(key, ids);
    }
  }
  return meetings;
}

export type PipeOverlap = { pipes: [string, string]; cells: Set<string> };

/** Shared cells at one height, excluding intentional connections. Index
 *  by cell rather than comparing every pair of full polylines. `only`
 *  restricts results to pairs containing at least one of those pipes. */
export function pipeOverlaps(
  doc: PlateDocument,
  only?: ReadonlySet<string>,
): PipeOverlap[] {
  const meetings = pipeMeetings(doc);
  const owners = new Map<string, Set<string>>();
  const overlaps = new Map<string, PipeOverlap>();
  for (const [id, cells] of occupancyOf(doc).runs) {
    for (const cell of cells) {
      const key = cellKey(cell);
      const others = owners.get(key) ?? new Set<string>();
      for (const other of others) {
        if (other === id || (only && !only.has(id) && !only.has(other)))
          continue;
        const pair = pipePairKey(other, id);
        if (meetings.get(pair)?.has(key)) continue;
        const overlap = overlaps.get(pair) ?? {
          pipes: [other, id],
          cells: new Set<string>(),
        };
        overlap.cells.add(key);
        overlaps.set(pair, overlap);
      }
      others.add(id);
      owners.set(key, others);
    }
  }
  return [...overlaps.values()];
}

/** New overlapping cells, not just new pairs: extending an existing overlap
 *  must be detected too, while unrelated pre-existing overlaps stay editable. */
export function freshOverlaps(
  after: PipeOverlap[],
  before: PipeOverlap[],
): PipeOverlap[] {
  const had = new Map(before.map((o) => [pipePairKey(...o.pipes), o.cells]));
  return after.flatMap((overlap) => {
    const previous = had.get(pipePairKey(...overlap.pipes));
    const cells = new Set(
      [...overlap.cells].filter((cell) => !previous?.has(cell)),
    );
    return cells.size ? [{ ...overlap, cells }] : [];
  });
}

/** Whether a new inline placement would occupy another rider's cell. The
 *  moving rider keeps its own cell, including on an unchanged gesture. */
export function riderCellTaken(
  occupancy: Occupancy,
  cell: Cell,
  except?: string,
): boolean {
  const key = cellKey(cell);
  return [...occupancy.riders].some(
    ([id, at]) => id !== except && cellKey(at) === key,
  );
}
