import {
  symbolSchemas,
  type Cell,
  type Endpoint,
  type PipeElement,
  type Side,
  type SymbolElement,
} from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { runCells } from "@/components/synoptic/runs";
import { symbolRotation } from "@/components/synoptic/symbols/footprint";
import {
  portsOf,
  symbolPort,
  type CollectorProps,
  type PortAnchor,
} from "@/components/synoptic/symbols/ports";

/**
 * The run rules of the backend's save-time pass (`validation.py`), mirrored
 * so the editor can tell, before a save, whether an edit left a run the
 * backend refuses: an edit that moves a port must re-route what hangs on
 * it, and the re-route is judged by these rules. Same codes as the
 * backend's `Violation`, since the save's own errors carry those.
 *
 * Deliberately a subset: props, slots and bindings need the registry's
 * models or a device resolver, and are left to the save. A symbol whose
 * type the bundled registry does not know has no ports here, so a run on
 * it reads `unknown_port` where the backend says `unknown_symbol_type`.
 */
export type RunRule =
  | "unknown_symbol"
  | "unknown_port"
  | "zero_length_segment"
  | "diagonal_segment"
  | "port_side_mismatch"
  | "off_polyline"
  | "self_reference"
  | "unknown_pipe"
  | "unusable_pipe"
  | "not_inline_capable"
  | "inline_on_endpoint"
  | "flat_depth";

/** One broken rule, filed under the element an author would select to fix
 *  it: the run for its own geometry and its tags, the branch for a tee,
 *  the symbol for an inline placement. */
export type RunViolation = { element: string; rule: RunRule };

/** A run's cells as keys: every cell it crosses, and every cell but its two
 *  ends, where an inline symbol may sit. Position-based like the backend's:
 *  a run doubling back over its first cell crosses it again inside. */
export type RunCells = { cells: Set<string>; interior: Set<string> };

export const cellKey = (c: Cell): string => `${c.x},${c.y},${c.z ?? 0}`;
export const planKey = (c: Cell): string => `${c.x},${c.y}`;
export const sameCell = (a: Cell, b: Cell): boolean =>
  cellKey(a) === cellKey(b);

const SIDES: Record<string, Side> = {
  "1,0,0": "+x",
  "-1,0,0": "-x",
  "0,1,0": "+y",
  "0,-1,0": "-y",
  "0,0,1": "+z",
  "0,0,-1": "-z",
};

/** The face the axis-aligned segment `a -> b` leaves `a` through. */
export function direction(a: Cell, b: Cell): Side | undefined {
  const d = [
    Math.sign(b.x - a.x),
    Math.sign(b.y - a.y),
    Math.sign((b.z ?? 0) - (a.z ?? 0)),
  ];
  return SIDES[d.join(",")];
}

/** How the segment `a -> b` breaks the one-axis rule, if it does. */
export function segmentRule(
  a: Cell,
  b: Cell,
): "zero_length_segment" | "diagonal_segment" | null {
  const moved = [a.x !== b.x, a.y !== b.y, (a.z ?? 0) !== (b.z ?? 0)].filter(
    Boolean,
  ).length;
  if (moved === 0) return "zero_length_segment";
  return moved === 1 ? null : "diagonal_segment";
}

/** Where a port endpoint attaches, or null when the plate has no such
 *  symbol or the symbol no such port. Checked against `portsOf` first, so
 *  a missing port is an answer here rather than a console warning. */
export function portAnchorOf(
  endpoint: Extract<Endpoint, { kind: "port" }>,
  symbols: Map<string, SymbolElement>,
): PortAnchor | null {
  const symbol = symbols.get(endpoint.symbol);
  if (!symbol) return null;
  const props = symbol.props as CollectorProps | undefined;
  if (!(endpoint.port in portsOf(symbol.type, props))) return null;
  return (
    symbolPort(
      symbol.type,
      symbol.placement.cell,
      symbolRotation(symbol),
      endpoint.port,
      props,
    ) ?? null
  );
}

/** The authored corners of a run, its endpoint cells around its waypoints,
 *  or null when an endpoint names a symbol or port the plate lacks. */
export function runCorners(
  pipe: PipeElement,
  symbols: Map<string, SymbolElement>,
): Cell[] | null {
  const cellOf = (e: Endpoint): Cell | null =>
    e.kind === "port" ? (portAnchorOf(e, symbols)?.cell ?? null) : e.cell;
  const start = cellOf(pipe.from);
  const end = cellOf(pipe.to);
  if (!start || !end) return null;
  return [start, ...(pipe.waypoints ?? []), end];
}

/** The cells of a run whose corners pass the one-axis rule. */
export function cellsOf(corners: Cell[]): RunCells {
  const cells = runCells(corners);
  return {
    cells: new Set(cells.map(cellKey)),
    interior: new Set(cells.slice(1, -1).map(cellKey)),
  };
}

/** The geometry of one run: its endpoints resolve, every segment moves
 *  along one axis, and it leaves and enters its ports through their
 *  faces. Its tags ride it. Returns its cells when the geometry holds, as
 *  the backend only lets a valid run carry tees and inline symbols. */
function checkPipe(
  pipe: PipeElement,
  symbols: Map<string, SymbolElement>,
  out: RunViolation[],
): RunCells | null {
  const add = (rule: RunRule) => out.push({ element: pipe.id, rule });
  let resolved = true;
  for (const end of [pipe.from, pipe.to]) {
    if (end.kind !== "port") continue;
    if (!symbols.has(end.symbol)) {
      add("unknown_symbol");
      resolved = false;
    } else if (!portAnchorOf(end, symbols)) {
      add("unknown_port");
      resolved = false;
    }
  }
  const corners = resolved ? runCorners(pipe, symbols) : null;
  if (!corners) return null;
  let aligned = true;
  corners.slice(1).forEach((b, i) => {
    const rule = segmentRule(corners[i], b);
    if (rule) {
      add(rule);
      aligned = false;
    }
  });
  if (!aligned) return null;
  const ends: [Endpoint, Cell, Cell][] = [
    [pipe.from, corners[0], corners[1]],
    [pipe.to, corners[corners.length - 1], corners[corners.length - 2]],
  ];
  for (const [end, at, neighbour] of ends) {
    if (end.kind !== "port") continue;
    const anchor = portAnchorOf(end, symbols);
    if (anchor && direction(at, neighbour) !== anchor.side) {
      add("port_side_mismatch");
    }
  }
  const run = cellsOf(corners);
  for (const tag of pipe.tags ?? []) {
    if (!run.cells.has(cellKey(tag.at))) add("off_polyline");
  }
  return run;
}

/**
 * Every run rule the plate breaks: run geometry and tags, then tees, then
 * inline placements, then a flat plate's depths.
 *
 * With `only`, the check is limited to what hangs on those runs: their own
 * geometry and tags, the tees from or onto them, the symbols riding them,
 * and their depths. A run outside the set is still resolved when a tee
 * needs its cells, but its own faults are not reported. That is what an
 * edit asks after re-routing a few runs, at a fraction of a full pass.
 */
export function runViolations(
  doc: PlateDocument,
  only?: ReadonlySet<string>,
): RunViolation[] {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const pipes = new Map((doc.pipes ?? []).map((p) => [p.id, p]));
  const inScope = (id: string) => !only || only.has(id);
  const violations: RunViolation[] = [];
  const runs = new Map<string, RunCells | null>();
  const runOf = (id: string): RunCells | null => {
    if (!runs.has(id)) {
      const pipe = pipes.get(id);
      const sink = inScope(id) ? violations : [];
      runs.set(id, pipe ? checkPipe(pipe, symbols, sink) : null);
    }
    return runs.get(id)!;
  };
  /** The rule a reference to `id` breaks when it cannot be followed. */
  const unreachable = (id: string): RunRule | null =>
    !pipes.has(id) ? "unknown_pipe" : runOf(id) ? null : "unusable_pipe";

  for (const pipe of doc.pipes ?? []) {
    if (inScope(pipe.id)) runOf(pipe.id);
  }
  for (const pipe of doc.pipes ?? []) {
    for (const end of [pipe.from, pipe.to]) {
      if (end.kind !== "pipe") continue;
      if (!inScope(pipe.id) && !inScope(end.pipe)) continue;
      const add = (rule: RunRule) =>
        violations.push({ element: pipe.id, rule });
      if (end.pipe === pipe.id) {
        add("self_reference");
        continue;
      }
      const broken = unreachable(end.pipe);
      if (broken) add(broken);
      else if (!runOf(end.pipe)!.cells.has(cellKey(end.cell))) {
        add("off_polyline");
      }
    }
  }
  for (const symbol of doc.symbols ?? []) {
    const { placement } = symbol;
    if (placement.kind !== "pipe" || !inScope(placement.pipe)) continue;
    const add = (rule: RunRule) =>
      violations.push({ element: symbol.id, rule });
    const schema = symbolSchemas[symbol.type];
    if (schema && !schema["x-inline"]) add("not_inline_capable");
    const broken = unreachable(placement.pipe);
    if (broken) {
      add(broken);
      continue;
    }
    const run = runOf(placement.pipe)!;
    const key = cellKey(placement.cell);
    if (!run.cells.has(key)) add("off_polyline");
    else if (!run.interior.has(key)) add("inline_on_endpoint");
  }
  if (doc.projection === "flat") {
    for (const { element, z } of depthsOf(doc)) {
      if (z && inScope(element)) {
        violations.push({ element, rule: "flat_depth" });
      }
    }
  }
  return violations;
}

/** Every depth the backend checks on a flat plate, by the element that
 *  carries it: symbol placements, the cells of ends that are not ports,
 *  waypoints, tags and labels. */
export function depthsOf(doc: PlateDocument): { element: string; z: number }[] {
  const depths: { element: string; z: number }[] = [];
  for (const symbol of doc.symbols ?? []) {
    depths.push({ element: symbol.id, z: symbol.placement.cell.z ?? 0 });
  }
  for (const pipe of doc.pipes ?? []) {
    for (const end of [pipe.from, pipe.to]) {
      if (end.kind !== "port") {
        depths.push({ element: pipe.id, z: end.cell.z ?? 0 });
      }
    }
    for (const cell of pipe.waypoints ?? []) {
      depths.push({ element: pipe.id, z: cell.z ?? 0 });
    }
    for (const tag of pipe.tags ?? []) {
      depths.push({ element: pipe.id, z: tag.at.z ?? 0 });
    }
  }
  for (const label of doc.labels ?? []) {
    depths.push({ element: label.id, z: label.at.z ?? 0 });
  }
  return depths;
}

const ruleKey = (v: RunViolation) => `${v.element}|${v.rule}`;

/** The violations of `after` that `before` did not already have: an edit
 *  is judged on what it breaks, not on what the plate already carried. */
export function freshViolations(
  after: RunViolation[],
  before: RunViolation[],
): RunViolation[] {
  const left = new Map<string, number>();
  for (const v of before) left.set(ruleKey(v), (left.get(ruleKey(v)) ?? 0) + 1);
  return after.filter((v) => {
    const n = left.get(ruleKey(v)) ?? 0;
    if (n > 0) {
      left.set(ruleKey(v), n - 1);
      return false;
    }
    return true;
  });
}
