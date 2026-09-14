import type {
  Cell,
  Endpoint,
  PipeElement,
  Projection,
  Side,
  SymbolElement,
} from "@gridone/sdk";
import { PIPE_AXIS_Z, portPoint, project } from "./projection";
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
 * Cuts a run into per-cell pieces so each can carry its own depth key. A
 * port endpoint's piece reaches the port face, so the pipe is drawn from
 * the symbol's edge; a free or tee endpoint's piece stops at the centre.
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
  const facePoint = (endpoint: Endpoint, cell: Cell) => {
    const side =
      endpoint.kind === "port" ? portAnchor(endpoint, symbols)?.side : null;
    return side
      ? portPoint(projection, cell, side)
      : axisCentre(projection, cell);
  };
  const centres = cells.map((c) => axisCentre(projection, c));
  return cells.map((cell, i) => {
    const prev = i > 0 ? cells[i - 1] : undefined;
    const next = i < cells.length - 1 ? cells[i + 1] : undefined;
    const entry = prev
      ? midpoint(centres[i - 1], centres[i])
      : facePoint(pipe.from, cell);
    const exit = next
      ? midpoint(centres[i], centres[i + 1])
      : facePoint(pipe.to, cell);
    const step = next
      ? planStep(cell, next)
      : prev
        ? planStep(prev, cell)
        : { x: 1, y: 0 };
    const direction = step.x === 0 && step.y === 0 ? { x: 1, y: 0 } : step;
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
