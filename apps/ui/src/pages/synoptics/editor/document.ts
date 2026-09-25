import {
  symbolSchemas,
  type Cell,
  type Endpoint,
  type PipeElement,
  type Projection,
  type Side,
  type SlotValue,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import { sideVector, rotateSide } from "@/components/synoptic/projection";
import { endpointCell } from "@/components/synoptic/runs";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import {
  footprintCells,
  footprintRect,
} from "@/components/synoptic/symbols/footprint";
import type { CollectorProps } from "@/components/synoptic/symbols/ports";
import { depthsOf } from "./runRules";

export type Selection = { kind: "symbol" | "pipe"; id: string } | null;

/** Where a run starts or ends while it is drawn: the endpoint, its cell,
 *  and the face it must leave or enter through when it is a port. */
export type RoutePoint = { endpoint: Endpoint; cell: Cell; side?: Side };

export const emptyDocument = (
  name: string,
  projection: Projection = "isometric",
): PlateDocument => ({
  version: 1,
  name,
  description: null,
  projection,
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

/** A plate as the backend reads it: a null and a missing field alike, and
 *  a cell's height of 0 as no height at all, both being its defaults. */
const canonical = (doc: PlateDocument) =>
  JSON.stringify(doc, (key, value: unknown) =>
    value === null || (key === "z" && value === 0) ? undefined : value,
  );

/**
 * Whether two plates say the same thing. A plate stored without heights,
 * moved and put back, comes back with `z: 0` on its cells, and a label
 * typed then cleared comes back `null` where it was missing: neither is a
 * change, and neither may leave an undo step or an unsaved mark behind.
 */
export const samePlate = (a: PlateDocument, b: PlateDocument): boolean =>
  a === b || canonical(a) === canonical(b);

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

/** The first of `name(1)`, `name(2)`, ... that is not `taken`. */
export function nextFree(
  name: (n: number) => string,
  taken: (candidate: string) => boolean,
): string {
  for (let n = 1; ; n++) {
    if (!taken(name(n))) return name(n);
  }
}

/** `<prefix>-<n>`, the smallest `n` no element of the plate uses. */
export function nextId(doc: PlateDocument, prefix: string): string {
  const used = usedIds(doc);
  return nextFree(
    (n) => `${prefix}-${n}`,
    (id) => used.has(id),
  );
}

/** The cell next to `from` through its `side` face. */
export const step = (from: Cell, side: Side): Cell => {
  const v = sideVector(side);
  return { x: from.x + v.x, y: from.y + v.y, z: (from.z ?? 0) + v.z };
};

type Dir = { x: number; y: number };

const opposite = (a: Dir | null, b: Dir) =>
  !!a && a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0);

/** Which way a straight run steps aside along `axis`: `+1` unless that
 *  runs back into the face just left or onto the body about to be
 *  entered, in which case `-1`. Only one of the two can constrain it: the
 *  other faces along the run, which is why the run steps aside at all. */
function clearSide(axis: "x" | "y", out: Dir | null, into: Dir | null): 1 | -1 {
  return out?.[axis] === -1 || into?.[axis] === 1 ? -1 : 1;
}

/** The coordinate a run turns at between `from` and `to` on one axis:
 *  halfway when there is room, one cell back from `from` when the two are
 *  adjacent, so the turn never lands on `from` itself. */
function excursion(from: number, to: number): number {
  const delta = to - from;
  return Math.abs(delta) >= 2
    ? from + Math.trunc(delta / 2)
    : from - Math.sign(delta);
}

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
    // The side it steps to is the one neither port's body sits on: a step
    // back into the face just left, or onto the body about to be entered,
    // is the doubling back this branch exists to avoid.
    const along: Dir = { x: dx, y: dy };
    if (opposite(out, along) || opposite(into, along)) {
      const axis = dx !== 0 ? "y" : "x";
      const aside = clearSide(axis, out, into);
      plan =
        axis === "y"
          ? [
              { x: a.x, y: a.y + aside, z },
              { x: b.x, y: a.y + aside, z },
            ]
          : [
              { x: a.x + aside, y: a.y, z },
              { x: a.x + aside, y: b.y, z },
            ];
    } else {
      plan = [];
    }
  } else if (bad(alongX, alongY) && bad(alongY, alongX)) {
    // Out on the axis the face left does not run along, halfway, across,
    // then on to the approach. Cells one apart on that axis have no
    // halfway: the run goes one cell the other way instead, so the
    // excursion never collapses into the single bend just refused.
    if (out ? out.x === 0 : into?.x !== 0) {
      const mid = excursion(a.x, b.x);
      plan = [
        { x: mid, y: a.y, z },
        { x: mid, y: b.y, z },
      ];
    } else {
      const mid = excursion(a.y, b.y);
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
  return waypointsOf(cells);
}

/** The waypoints of a path given as the cells it turns or passes at, its
 *  two ends left out: a cell repeated back to back is one, a step out and
 *  straight back is dropped, and a cell a straight line runs through is no
 *  corner. */
export function waypointsOf(cells: Cell[]): Cell[] {
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

/** The ports of `id` a run starts or ends on. */
export function attachedPorts(doc: PlateDocument, id: string): Set<string> {
  return new Set(
    (doc.pipes ?? []).flatMap((p) =>
      [p.from, p.to].flatMap((e) =>
        e.kind === "port" && e.symbol === id ? [e.port] : [],
      ),
    ),
  );
}

/** Removes a symbol. A run attached to one of its ports keeps its cell as
 *  a free endpoint, so nothing vanishes with the symbol. */
export function removeSymbol(doc: PlateDocument, id: string): PlateDocument {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
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

/** What a placed symbol's props start as: every field its type requires,
 *  at the value the inspector would show for it (an enum's first choice,
 *  a number's minimum, an empty text, no ports). Seeded at placement so
 *  the document saves as it reads; a type whose required field has no
 *  such value gets none, and the save names the type. */
export function defaultProps(type: string): Record<string, unknown> {
  const schema = symbolSchemas[type];
  return Object.fromEntries(
    (schema?.required ?? []).flatMap((key) => {
      const prop = schema.properties[key] as
        | { type?: string; enum?: unknown[]; minimum?: number }
        | undefined;
      const value = prop?.enum
        ? prop.enum[0]
        : prop?.type === "string"
          ? ""
          : prop?.type === "integer" || prop?.type === "number"
            ? (prop.minimum ?? 0)
            : prop?.type === "object"
              ? {}
              : undefined;
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

/** Whether a symbol's rotation is the author's to set: free-standing, and
 *  of a type that does not lock it (a collector's bar direction is
 *  authored in its props). */
export const canRotate = (symbol: SymbolElement) =>
  symbol.placement.kind === "cell" &&
  !symbolSchemas[symbol.type]?.["x-rotation-locked"];

/** A quarter turn more, when the symbol can turn. */
export const rotateSymbol = (doc: PlateDocument, id: string): PlateDocument =>
  updateSymbol(doc, id, (s) =>
    canRotate(s) && s.placement.kind === "cell"
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

/** The cells of the plan the free symbols stand on. */
function occupied(doc: PlateDocument): Set<string> {
  return new Set(
    (doc.symbols ?? [])
      .filter((s) => s.placement.kind === "cell")
      .flatMap(footprintCells)
      .map((c) => `${c.x},${c.y}`),
  );
}

/** How far along the plan a copy may be pushed before giving up: past
 *  this, the author places one from the library. */
const DUPLICATE_TRIES = 8;

/**
 * A copy of a free symbol beside it: the same type, props and rotation,
 * but no device and no binding, since a copy is another machine of the
 * same kind, not the same one twice. It goes one cell right of the
 * original's turned footprint, then further right, one footprint at a
 * time, until it stands clear of every body. Null for a symbol riding a
 * run, or when nothing clear is found.
 */
export function duplicateSymbol(
  doc: PlateDocument,
  id: string,
): { doc: PlateDocument; id: string } | null {
  const symbol = doc.symbols?.find((s) => s.id === id);
  if (!symbol || symbol.placement.kind !== "cell") return null;
  const { cell } = symbol.placement;
  const rect = footprintRect(symbol);
  const step = rect.x1 - rect.x0 + 1;
  const taken = occupied(doc);
  const copyId = nextId(doc, symbol.type);
  for (let n = 1; n <= DUPLICATE_TRIES; n++) {
    const copy: SymbolElement = {
      ...symbol,
      id: copyId,
      label: null,
      device_id: null,
      bindings: {},
      placement: {
        ...symbol.placement,
        cell: { ...cell, x: cell.x + n * step },
      },
    };
    if (footprintCells(copy).some((c) => taken.has(`${c.x},${c.y}`))) continue;
    return { doc: addSymbol(doc, copy), id: copyId };
  }
  return null;
}

/**
 * A collector turned to run along `axis`, its ports turned with it: a
 * quarter turn one way from x to y and back the other way from y to x,
 * so switching twice gives the collector back as it was. Offsets stay:
 * a port three cells along the bar is still three cells along it.
 */
export function setCollectorAxis(
  doc: PlateDocument,
  id: string,
  axis: CollectorProps["axis"],
): PlateDocument {
  return updateSymbol(doc, id, (s) => {
    const props = s.props as CollectorProps | undefined;
    if (!props || props.axis === axis) return s;
    const turns = axis === "y" ? 1 : -1;
    return {
      ...s,
      props: {
        ...props,
        axis,
        ports: Object.fromEntries(
          Object.entries(props.ports ?? {}).map(([name, port]) => [
            name,
            { ...port, side: rotateSide(port.side, turns) },
          ]),
        ),
      },
    };
  });
}

/**
 * Whether anything on the plate stands above or below the floor: every
 * depth the backend refuses on a flat plate, and a collector port facing
 * up or down, which only a raised run can reach. A plate with any of it
 * cannot be shown flat by default.
 */
export function hasRaisedElements(doc: PlateDocument): boolean {
  if (depthsOf(doc).some((d) => d.z !== 0)) return true;
  return (doc.symbols ?? []).some((s) =>
    Object.values(
      (s.props as Partial<CollectorProps> | undefined)?.ports ?? {},
    ).some((port) => port.side === "+z" || port.side === "-z"),
  );
}

/** The one device a binding reads when it names it by id alone (`ids:
 *  [id]`, the form the editor writes and every committed plate uses), or
 *  null for a literal, a filter, or no binding. */
export function boundDevice(
  value: SlotValue | null | undefined,
): string | null {
  if (value?.kind !== "attribute") return null;
  const { ids, types, tags, driver_id } = value.target.devices ?? {};
  const byIdOnly =
    ids?.length === 1 &&
    !types?.length &&
    !Object.keys(tags ?? {}).length &&
    !driver_id;
  return byIdOnly ? ids[0] : null;
}

/**
 * A symbol made to stand for another device. The bindings that read the
 * device it stood for by id alone follow to the new one, since an author
 * picking the device first means "these readings, from that machine". A
 * binding reading another device (a sensor on a controller) stays as it
 * was. Clearing the device keeps every binding: they still read what they
 * read.
 */
export function withDevice(
  symbol: SymbolElement,
  deviceId: string | null,
): SymbolElement {
  const old = symbol.device_id ?? null;
  if (!deviceId || !old || old === deviceId) {
    return { ...symbol, device_id: deviceId };
  }
  const bindings = Object.fromEntries(
    Object.entries(symbol.bindings ?? {}).map(([slot, value]) => [
      slot,
      value.kind === "attribute" && boundDevice(value) === old
        ? {
            ...value,
            target: { ...value.target, devices: { ids: [deviceId] } },
          }
        : value,
    ]),
  );
  return { ...symbol, device_id: deviceId, bindings };
}
