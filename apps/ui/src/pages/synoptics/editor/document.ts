import {
  symbolSchemas,
  type Cell,
  type Endpoint,
  type PipeElement,
  type Side,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import {
  endpointCell,
  sideVector,
  type PlateDocument,
} from "@/components/synoptic";

export type Selection = { kind: "symbol" | "pipe"; id: string } | null;

/** Where a run starts or ends while it is drawn: the endpoint, its cell,
 *  and the face it must leave or enter through when it is a port. */
export type RoutePoint = { endpoint: Endpoint; cell: Cell; side?: Side };

export const emptyDocument = (name: string): PlateDocument => ({
  version: 1,
  name,
  description: null,
  projection: "isometric",
  symbols: [],
  pipes: [],
  labels: [],
});

/** The authored document alone: what create and replace take. */
export function toDocument(synoptic: Synoptic): PlateDocument {
  const doc: PlateDocument & Partial<Synoptic> = { ...synoptic };
  delete doc.id;
  delete doc.metadata;
  return doc;
}

const sameCell = (a: Cell, b: Cell) =>
  a.x === b.x && a.y === b.y && (a.z ?? 0) === (b.z ?? 0);

/** Every id on the plate: symbols, pipes, tags and labels share one namespace. */
function usedIds(doc: PlateDocument): Set<string> {
  return new Set([
    ...(doc.symbols ?? []).map((s) => s.id),
    ...(doc.pipes ?? []).flatMap((p) => [
      p.id,
      ...(p.tags ?? []).map((t) => t.id),
    ]),
    ...(doc.labels ?? []).map((l) => l.id),
  ]);
}

/** `<prefix>-<n>`, the smallest `n` no element of the plate uses. */
export function nextId(doc: PlateDocument, prefix: string): string {
  const used = usedIds(doc);
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}

const step = (from: Cell, side: Side): Cell => {
  const v = sideVector(side);
  return { x: from.x + v.x, y: from.y + v.y, z: (from.z ?? 0) + v.z };
};

type Dir = { x: number; y: number };

const opposite = (a: Dir | null, b: Dir) =>
  !!a && a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0);

/** Axis-aligned corners from `a` to `b`, `a` and `b` excluded. The plan
 *  travels one axis then the other; the order is the one whose first
 *  segment does not run back against `out` (the face a run just left)
 *  and whose last does not run against `into` (the face it enters), the
 *  longer axis first when both orders are fine. When neither is, or when
 *  a straight run would have to, the run steps aside first, so it never
 *  doubles back through the body it leaves or reaches. A climb comes
 *  before the travel and a descent after it, so a raised waypoint reads
 *  as an overhead run. */
function corners(a: Cell, b: Cell, out: Dir | null, into: Dir | null): Cell[] {
  const az = a.z ?? 0;
  const bz = b.z ?? 0;
  const z = Math.max(az, bz);
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  const alongX: Dir = { x: dx, y: 0 };
  const alongY: Dir = { x: 0, y: dy };
  const bad = (first: Dir, last: Dir) =>
    opposite(out, first) || opposite(into, last);
  let plan: Cell[];
  if (dx === 0 || dy === 0) {
    // A straight run that would leave or arrive against a face steps one
    // cell aside, travels, and steps back, so it never crosses the body.
    const along: Dir = { x: dx, y: dy };
    if (opposite(out, along) || opposite(into, along)) {
      plan =
        dx !== 0
          ? [
              { x: a.x, y: a.y + 1, z },
              { x: b.x, y: a.y + 1, z },
            ]
          : [
              { x: a.x + 1, y: a.y, z },
              { x: a.x + 1, y: b.y, z },
            ];
    } else {
      plan = [];
    }
  } else if (bad(alongX, alongY) && bad(alongY, alongX)) {
    // Out on the axis the face left does not run along, halfway, across,
    // then on to the approach.
    if (out ? out.x === 0 : into?.x !== 0) {
      const mid = a.x + Math.trunc((b.x - a.x) / 2);
      plan = [
        { x: mid, y: a.y, z },
        { x: mid, y: b.y, z },
      ];
    } else {
      const mid = a.y + Math.trunc((b.y - a.y) / 2);
      plan = [
        { x: a.x, y: mid, z },
        { x: b.x, y: mid, z },
      ];
    }
  } else {
    const longerX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    const xFirst = bad(alongX, alongY) ? false : bad(alongY, alongX) || longerX;
    plan = [xFirst ? { x: b.x, y: a.y, z } : { x: a.x, y: b.y, z }];
  }
  const found: Cell[] = [];
  let cur: Cell = { x: a.x, y: a.y, z: az };
  const push = (c: Cell) => {
    if (!sameCell(c, cur)) found.push(c);
    cur = c;
  };
  if (bz > az) push({ x: a.x, y: a.y, z: bz });
  for (const c of plan) push(c);
  push({ x: b.x, y: b.y, z });
  push({ x: b.x, y: b.y, z: bz });
  return found.filter((c) => !sameCell(c, b));
}

const dirOf = (side: Side): Dir => {
  const v = sideVector(side);
  return { x: v.x, y: v.y };
};

/** The waypoints of a run through `points`: each port is left or entered
 *  through its face, then the corners between consecutive points. Cells
 *  that repeat or lie on a straight segment are dropped. */
export function routeWaypoints(points: RoutePoint[]): Cell[] {
  const cells: Cell[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev) {
      const from = prev.side ? step(prev.cell, prev.side) : prev.cell;
      const to = p.side ? step(p.cell, p.side) : p.cell;
      // Two ports facing each other across one edge join directly.
      const facing = sameCell(from, p.cell) && sameCell(to, prev.cell);
      if (!facing) {
        const out = prev.side ? dirOf(prev.side) : null;
        const into = p.side
          ? { x: -dirOf(p.side).x, y: -dirOf(p.side).y }
          : null;
        cells.push(from, ...corners(from, to, out, into), to);
      }
    }
    cells.push(p.cell);
  });
  // A cell repeated back to back is one cell; a run that steps out and
  // straight back drops the spike.
  let path = cells;
  for (;;) {
    const dedup = path.filter((c, i) => i === 0 || !sameCell(c, path[i - 1]));
    const spike = dedup.findIndex(
      (_, i) =>
        i > 0 && i < dedup.length - 1 && sameCell(dedup[i - 1], dedup[i + 1]),
    );
    if (spike < 0) {
      path = dedup;
      break;
    }
    path = dedup.filter((_, i) => i !== spike);
  }
  // Three cells on one line, in one direction: the middle one is no corner.
  const straight = (a: Cell, b: Cell, c: Cell) =>
    Math.sign(b.x - a.x) === Math.sign(c.x - b.x) &&
    Math.sign(b.y - a.y) === Math.sign(c.y - b.y) &&
    Math.sign((b.z ?? 0) - (a.z ?? 0)) === Math.sign((c.z ?? 0) - (b.z ?? 0));
  return path.filter(
    (c, i) =>
      i > 0 && i < path.length - 1 && !straight(path[i - 1], c, path[i + 1]),
  );
}

const symbolsOf = (doc: PlateDocument) =>
  new Map((doc.symbols ?? []).map((s) => [s.id, s]));

/** Removes a symbol. A run attached to one of its ports keeps its cell as
 *  a free endpoint, so nothing vanishes with the symbol. */
export function removeSymbol(doc: PlateDocument, id: string): PlateDocument {
  const symbols = symbolsOf(doc);
  const free = (e: Endpoint): Endpoint =>
    e.kind === "port" && e.symbol === id
      ? { kind: "cell", cell: endpointCell(e, symbols) }
      : e;
  return {
    ...doc,
    symbols: (doc.symbols ?? []).filter((s) => s.id !== id),
    pipes: (doc.pipes ?? []).map((p) => ({
      ...p,
      from: free(p.from),
      to: free(p.to),
    })),
  };
}

/** Removes a run with the symbols riding it; a tee off it keeps its cell
 *  as a free endpoint. */
export function removePipe(doc: PlateDocument, id: string): PlateDocument {
  const free = (e: Endpoint): Endpoint =>
    e.kind === "pipe" && e.pipe === id ? { kind: "cell", cell: e.cell } : e;
  return {
    ...doc,
    symbols: (doc.symbols ?? []).filter(
      (s) => !(s.placement.kind === "pipe" && s.placement.pipe === id),
    ),
    pipes: (doc.pipes ?? [])
      .filter((p) => p.id !== id)
      .map((p) => ({ ...p, from: free(p.from), to: free(p.to) })),
  };
}

export const addSymbol = (
  doc: PlateDocument,
  symbol: SymbolElement,
): PlateDocument => ({
  ...doc,
  symbols: [...(doc.symbols ?? []), symbol],
});

export const addPipe = (
  doc: PlateDocument,
  pipe: PipeElement,
): PlateDocument => ({
  ...doc,
  pipes: [...(doc.pipes ?? []), pipe],
});

export const updateSymbol = (
  doc: PlateDocument,
  id: string,
  patch: (symbol: SymbolElement) => SymbolElement,
): PlateDocument => ({
  ...doc,
  symbols: (doc.symbols ?? []).map((s) => (s.id === id ? patch(s) : s)),
});

export const updatePipe = (
  doc: PlateDocument,
  id: string,
  patch: (pipe: PipeElement) => PipeElement,
): PlateDocument => ({
  ...doc,
  pipes: (doc.pipes ?? []).map((p) => (p.id === id ? patch(p) : p)),
});

/** A quarter turn more, unless the type locks its rotation (a collector's
 *  bar direction is authored in its props). */
export const rotateSymbol = (doc: PlateDocument, id: string): PlateDocument =>
  updateSymbol(doc, id, (s) =>
    s.placement.kind === "cell" && !symbolSchemas[s.type]?.["x-rotation-locked"]
      ? {
          ...s,
          placement: {
            ...s.placement,
            rotation: ((s.placement.rotation ?? 0) + 1) % 4,
          },
        }
      : s,
  );

/** Moves a free-standing symbol to `cell`; the runs on its ports follow by
 *  construction, since a port endpoint has no cell of its own. */
export const moveSymbol = (
  doc: PlateDocument,
  id: string,
  cell: Cell,
): PlateDocument =>
  updateSymbol(doc, id, (s) =>
    s.placement.kind === "cell"
      ? { ...s, placement: { ...s.placement, cell } }
      : s,
  );
