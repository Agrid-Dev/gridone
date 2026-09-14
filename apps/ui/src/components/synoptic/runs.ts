import {
  symbolSchemas,
  type Cell,
  type Endpoint,
  type PipeElement,
  type Projection,
  type Side,
  type SymbolElement,
} from "@gridone/sdk";
import { PIPE_AXIS_Z, project, rotateQuarter } from "./projection";
import { COLLECTOR_INSET } from "./symbols/Collector";
import { DRAWINGS } from "./symbols/drawings";
import { symbolPort, type CollectorProps } from "./symbols/ports";
import type { Pt } from "./types";

type PortAnchor = { cell: Cell; side: Side | null };

/** Where a port endpoint attaches, or null when the plate names a symbol
 *  or port the kit does not know: the run then falls back to the symbol's
 *  origin cell and its centre, so it stays visible rather than vanishing. */
function portAnchor(
  endpoint: Extract<Endpoint, { kind: "port" }>,
  symbols: Map<string, SymbolElement>,
): PortAnchor | null {
  const symbol = symbols.get(endpoint.symbol);
  if (!symbol) return null;
  const { cell, kind } = symbol.placement;
  const rotation = kind === "cell" ? (symbol.placement.rotation ?? 0) : 0;
  try {
    return symbolPort(
      symbol.type,
      cell,
      rotation,
      endpoint.port,
      symbol.props as CollectorProps | undefined,
    );
  } catch {
    return { cell, side: null };
  }
}

/** The cell an endpoint lands on: a port's cell, a free cell, or the cell
 *  of the trunk a tee branches from. An endpoint naming a symbol the plate
 *  does not have lands at the origin. */
export function endpointCell(
  endpoint: Endpoint,
  symbols: Map<string, SymbolElement>,
): Cell {
  if (endpoint.kind !== "port") return endpoint.cell;
  return portAnchor(endpoint, symbols)?.cell ?? { x: 0, y: 0, z: 0 };
}

/** Where the segment `a` to `b` first meets an edge of `polygon`, as a
 *  fraction of the segment, or null when it never does. */
function firstHit(a: Pt, b: Pt, polygon: Pt[]): number | null {
  let best: number | null = null;
  const d = { x: b.x - a.x, y: b.y - a.y };
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const e = { x: q.x - p.x, y: q.y - p.y };
    const denom = d.x * e.y - d.y * e.x;
    if (denom === 0) return;
    const w = { x: p.x - a.x, y: p.y - a.y };
    const t = (w.x * e.y - w.y * e.x) / denom;
    const u = (w.x * d.y - w.y * d.x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (best === null || t < best)) {
      best = t;
    }
  });
  return best;
}

/**
 * How far into a port's cell, in cells, the run stays visible when it
 * arrives through the face `arrival` points away from: up to the collector
 * bar's edge, or to where the line from that face to the cell centre meets
 * the drawing's silhouette. A silhouette the line never meets (a tank's
 * cylinder, which the line only grazes at the centre), a drawing without
 * one, or a run dropping in from above ends at the face; the stub under
 * the body joins the two.
 */
function portReach(symbol: SymbolElement, cell: Cell, arrival: Cell): number {
  if (arrival.z) return 0;
  const props = symbol.props as Partial<CollectorProps> | undefined;
  if (symbol.type === "collector" && props?.axis) {
    const along = props.axis === "x" ? arrival.x !== 0 : arrival.y !== 0;
    return along ? 0 : COLLECTOR_INSET;
  }
  const outline = DRAWINGS[symbol.type]?.outline;
  const footprint = symbolSchemas[symbol.type]?.["x-footprint"];
  if (!outline || !footprint) return 0;
  const { cell: origin, kind } = symbol.placement;
  const rotation = kind === "cell" ? (symbol.placement.rotation ?? 0) : 0;
  const offset = rotateQuarter(
    { x: cell.x - origin.x, y: cell.y - origin.y },
    -rotation,
  );
  const step = rotateQuarter(arrival, -rotation);
  const centre = { x: offset.x + 0.5, y: offset.y + 0.5 };
  const face = { x: centre.x - step.x / 2, y: centre.y - step.y / 2 };
  const t = firstHit(
    face,
    centre,
    outline({ x: footprint.w / 2, y: footprint.d / 2 }),
  );
  return t === null ? 0 : t / 2;
}

/** Every cell of an axis-aligned polyline, corners included once. */
export function runCells(polyline: Cell[]): Cell[] {
  const cells: Required<Cell>[] = [];
  polyline.forEach((to, i) => {
    if (i === 0) {
      cells.push({ x: to.x, y: to.y, z: to.z ?? 0 });
      return;
    }
    let cur = cells[cells.length - 1];
    const target = { x: to.x, y: to.y, z: to.z ?? 0 };
    while (cur.x !== target.x || cur.y !== target.y || cur.z !== target.z) {
      cur = {
        x: cur.x + Math.sign(target.x - cur.x),
        y: cur.y + Math.sign(target.y - cur.y),
        z: cur.z + Math.sign(target.z - cur.z),
      };
      cells.push(cur);
    }
  });
  return cells;
}

/** One cell's share of a run: the screen points of its half-segments in
 *  and out, meeting at the cell's centre on the pipe axis. */
export type RunPiece = {
  cell: Cell;
  points: Pt[];
  /** Run direction in plan through the cell, for an inline symbol. */
  direction: Pt;
  /** The share inside a port's cell, from the face to the centre under the
   *  body: drawn so the run meets the drawing, never carrying the arrow. */
  stub?: boolean;
};

const axisCentre = (projection: Projection, c: Cell) =>
  project(projection, c.x + 0.5, c.y + 0.5, (c.z ?? 0) + PIPE_AXIS_Z);

const midpoint = (a: Pt, b: Pt): Pt => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const planStep = (a: Cell, b: Cell): Pt => ({
  x: Math.sign(b.x - a.x),
  y: Math.sign(b.y - a.y),
});

/**
 * Cuts a run into per-cell pieces so each can carry its own depth key.
 * A port endpoint's cell is the symbol's own: the visible run ends where
 * the entry line meets the drawing's silhouette, with the arrow, and a
 * stub carries on to the cell centre under the body so the two always
 * join. A free or tee endpoint keeps a full piece stopping at the centre.
 * A bend cell holds its corner, so `Pipe` rounds it.
 */
export function runPieces(
  projection: Projection,
  pipe: PipeElement,
  symbols: Map<string, SymbolElement>,
): RunPiece[] {
  const from = endpointCell(pipe.from, symbols);
  const to = endpointCell(pipe.to, symbols);
  const cells = runCells([from, ...(pipe.waypoints ?? []), to]);
  const n = cells.length;
  const reach = (endpoint: Endpoint, port: number, neighbour: number) => {
    if (n < 2 || endpoint.kind !== "port") return null;
    if (!portAnchor(endpoint, symbols)?.side) return null;
    const a = cells[neighbour];
    const b = cells[port];
    const arrival = {
      x: Math.sign(b.x - a.x),
      y: Math.sign(b.y - a.y),
      z: Math.sign((b.z ?? 0) - (a.z ?? 0)),
    };
    return portReach(symbols.get(endpoint.symbol)!, b, arrival);
  };
  const fromReach = reach(pipe.from, 0, 1);
  const toReach = reach(pipe.to, n - 1, n - 2);
  const centres = cells.map((c) => axisCentre(projection, c));
  // The point `r` cells in from the face of the port cell `i`, on the run.
  const inFrom = (i: number, neighbour: number, r: number): Pt => {
    const face = midpoint(centres[neighbour], centres[i]);
    return {
      x: face.x + (centres[i].x - face.x) * 2 * r,
      y: face.y + (centres[i].y - face.y) * 2 * r,
    };
  };
  return cells.map((cell, i) => {
    let entry = i === 0 ? centres[0] : midpoint(centres[i - 1], centres[i]);
    let exit = i === n - 1 ? centres[i] : midpoint(centres[i], centres[i + 1]);
    if (i === 1 && fromReach !== null) entry = inFrom(0, 1, fromReach);
    if (i === n - 2 && toReach !== null) exit = inFrom(n - 1, n - 2, toReach);
    const step =
      i < n - 1
        ? planStep(cell, cells[i + 1])
        : i > 0
          ? planStep(cells[i - 1], cell)
          : { x: 1, y: 0 };
    const direction = step.x === 0 && step.y === 0 ? { x: 1, y: 0 } : step;
    if (i === 0 && fromReach !== null) {
      const start = inFrom(0, 1, fromReach);
      return {
        cell,
        points: [centres[0], centres[0], start],
        direction,
        stub: true,
      };
    }
    if (i === n - 1 && toReach !== null) {
      const end = inFrom(n - 1, n - 2, toReach);
      return {
        cell,
        points: [end, centres[i], centres[i]],
        direction,
        stub: true,
      };
    }
    return { cell, points: [entry, centres[i], exit], direction };
  });
}

/** The piece of `pieces` that holds `cell`, for a symbol or tag riding on
 *  the run. */
export function pieceAt(pieces: RunPiece[], cell: Cell): RunPiece | undefined {
  return pieces.find(
    (p) =>
      p.cell.x === cell.x &&
      p.cell.y === cell.y &&
      (p.cell.z ?? 0) === (cell.z ?? 0),
  );
}
