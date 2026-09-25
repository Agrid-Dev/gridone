import type {
  Cell,
  Endpoint,
  PipeElement,
  Side,
  SymbolElement,
} from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { runCells } from "@/components/synoptic/runs";
import { footprintCells } from "@/components/synoptic/symbols/footprint";
import type { RoutePoint } from "./document";
import { routeAround } from "./routeAround";
import {
  cellKey,
  cellsOf,
  direction,
  portAnchorOf,
  runCorners,
  freshViolations as fresh,
  runViolations,
  segmentRule,
} from "./runRules";

/** What an edit that moved ports comes to: the plate with its runs
 *  following, and the runs that could only follow by stretching their old
 *  path; or the reason the edit cannot stand, with the elements at fault. */
export type Reroute =
  | { ok: true; doc: PlateDocument; extended: string[] }
  | { ok: false; reason: "overlap" | "unroutable"; elements: string[] };

type Symbols = Map<string, SymbolElement>;

const OPPOSITE: Record<Side, Side> = {
  "+x": "-x",
  "-x": "+x",
  "+y": "-y",
  "-y": "+y",
  "+z": "-z",
  "-z": "+z",
};

const symbolsOf = (doc: PlateDocument): Symbols =>
  new Map((doc.symbols ?? []).map((s) => [s.id, s]));

const sameCell = (a: Cell, b: Cell) => cellKey(a) === cellKey(b);

/** A port end's cell and face as one comparable key: an edit moved the
 *  end when the key differs between the two plates. */
function anchorKey(end: Endpoint, symbols: Symbols): string | null {
  if (end.kind !== "port") return null;
  const anchor = portAnchorOf(end, symbols);
  return anchor ? `${cellKey(anchor.cell)}|${anchor.side}` : "none";
}

/** Where a run starts or ends for the router: a port with its face, or a
 *  free or tee cell. Null when a port no longer resolves. */
function routePoint(end: Endpoint, symbols: Symbols): RoutePoint | null {
  if (end.kind !== "port") return { endpoint: end, cell: end.cell };
  const anchor = portAnchorOf(end, symbols);
  return anchor
    ? { endpoint: end, cell: anchor.cell, side: anchor.side }
    : null;
}

/** A cell the run must reach from `side`'s neighbour, so it arrives there
 *  moving towards the face opposite `side`; a vertical face leaves it free. */
const cellPoint = (cell: Cell, arrive?: Side): RoutePoint => ({
  endpoint: { kind: "cell", cell },
  cell,
  side:
    arrive && arrive !== "+z" && arrive !== "-z" ? OPPOSITE[arrive] : undefined,
});

/** Corners with repeats and straight-through middles dropped: the form the
 *  router itself produces, so a re-routed run reads like a drawn one. */
function tidy(corners: Cell[]): Cell[] {
  const dedup = corners.filter(
    (c, i) => i === 0 || !sameCell(c, corners[i - 1]),
  );
  return dedup.filter((c, i) => {
    if (i === 0 || i === dedup.length - 1) return true;
    return direction(dedup[i - 1], c) !== direction(c, dedup[i + 1]);
  });
}

const flip = (pipe: PipeElement): PipeElement => ({
  ...pipe,
  from: pipe.to,
  to: pipe.from,
  waypoints: [...(pipe.waypoints ?? [])].reverse(),
});

/** Whether every segment of `corners` moves along one axis. */
const aligned = (corners: Cell[]) =>
  corners.slice(1).every((b, i) => segmentRule(corners[i], b) === null);

/** A new path for a run whose `from` end moved, and how many of its cells,
 *  from the start, are new: where riders that fell off go back. */
type Path = { corners: Cell[]; head: number };

/** Where a re-routed run may go: off the cells in `blocked`, and overhead
 *  only when `high` (a flat plate refuses any height). */
type Room = { blocked: ReadonlySet<string>; high: boolean };

/** The room with `cells` barred as well. */
const barring = (room: Room, cells: string[]): Room => ({
  blocked: new Set([...room.blocked, ...cells]),
  high: room.high,
});

/** Index of `cell` along `cells`, past the start; the last index if absent. */
function indexAfterStart(cells: Cell[], cell: Cell): number {
  const i = cells.findIndex((c, k) => k > 0 && sameCell(c, cell));
  return i < 0 ? cells.length - 1 : i;
}

function pathOf(corners: Cell[], until: Cell): Path {
  const tidied = tidy(corners);
  return { corners: tidied, head: indexAfterStart(runCells(tidied), until) };
}

/**
 * The run re-routed from its moved `from` end. The far part is kept as it
 * was from a **pin** on: the first cell another run tees onto, since the
 * branch's end is an absolute cell that must stay on its trunk; with no
 * tee, the second bend of a run of three bends or more, which keeps an
 * overhead hop and the author's routing of the far side. A run without a
 * pin is routed whole, to its far end. The new head arrives at the pin in
 * line with the kept part, so the joint never folds back.
 */
function followHead(
  pipe: PipeElement,
  before: Symbols,
  after: Symbols,
  tees: ReadonlySet<string>,
  room: Room,
): Path | null {
  const start = routePoint(pipe.from, after);
  const far = routePoint(pipe.to, after);
  if (!start || !far) return null;
  const whole = () => {
    const route = routeAround([start, far], room.blocked, room.high);
    return route ? pathOf([start.cell, ...route, far.cell], far.cell) : null;
  };
  const old = runCorners(pipe, before);
  if (!old || !aligned(old)) return whole();
  const cells = runCells(old);
  const teeAt = cells.findIndex(
    (c, i) => i > 0 && i < cells.length - 1 && tees.has(cellKey(c)),
  );
  let pin: Cell;
  let rest: Cell[];
  if (teeAt >= 0) {
    pin = cells[teeAt];
    // The corners strictly past the pin, found by their distance along
    // the run: every segment of an aligned run spans its one delta.
    let along = 0;
    rest = old.filter((c, k) => {
      if (k > 0) {
        const prev = old[k - 1];
        along +=
          Math.abs(c.x - prev.x) +
          Math.abs(c.y - prev.y) +
          Math.abs((c.z ?? 0) - (prev.z ?? 0));
      }
      return along > teeAt;
    });
  } else if ((pipe.waypoints ?? []).length >= 3) {
    pin = old[2];
    rest = old.slice(3);
  } else {
    return whole();
  }
  // The head keeps off the part kept, as well as off what is in the way.
  const kept = barring(
    room,
    runCells([pin, ...rest])
      .slice(1)
      .map(cellKey),
  );
  const head = routeAround(
    [start, cellPoint(pin, direction(pin, rest[0]))],
    kept.blocked,
    kept.high,
  );
  return head ? pathOf([start.cell, ...head, pin, ...rest], pin) : null;
}

/** A run whose two ends both moved, routed through the cells other runs
 *  tee onto, in the order the old run crossed them. */
function followBoth(
  pipe: PipeElement,
  before: Symbols,
  after: Symbols,
  tees: ReadonlySet<string>,
  room: Room,
): Path | null {
  const start = routePoint(pipe.from, after);
  const end = routePoint(pipe.to, after);
  if (!start || !end) return null;
  const old = runCorners(pipe, before);
  const seen = new Set<string>();
  const pins =
    old && aligned(old)
      ? runCells(old)
          .slice(1, -1)
          .filter((c) => {
            const key = cellKey(c);
            if (!tees.has(key) || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
      : [];
  const route = routeAround(
    [start, ...pins.map((c) => cellPoint(c)), end],
    room.blocked,
    room.high,
  );
  return route ? pathOf([start.cell, ...route, end.cell], end.cell) : null;
}

/** The fallback: the whole old run kept, with a new head from the moved
 *  port to the old port cell, arriving along the old face. Every old cell
 *  stays on the run, so its tees, riders and tags stay put. */
function extendHead(
  pipe: PipeElement,
  before: Symbols,
  after: Symbols,
  room: Room,
): Path | null {
  const start = routePoint(pipe.from, after);
  const was = routePoint(pipe.from, before);
  const old = runCorners(pipe, before);
  if (!start || !was || !old) return null;
  const kept = barring(room, runCells(old).slice(1).map(cellKey));
  const head = routeAround(
    [start, cellPoint(was.cell, was.side)],
    kept.blocked,
    kept.high,
  );
  return head
    ? pathOf([start.cell, ...head, was.cell, ...old.slice(1)], was.cell)
    : null;
}

/** Every cell other runs tee onto, by the run they tee onto. */
function teeCells(doc: PlateDocument): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const pipe of doc.pipes ?? []) {
    for (const end of [pipe.from, pipe.to]) {
      if (end.kind !== "pipe") continue;
      const cells = found.get(end.pipe) ?? new Set<string>();
      cells.add(cellKey(end.cell));
      found.set(end.pipe, cells);
    }
  }
  return found;
}

/**
 * Riders that fell off a re-routed run go back onto its new head, in the
 * order the old run carried them, spread evenly: inline symbols on cells
 * strictly inside the run, tags on any. Never on a riser, where the run
 * climbs in place and a symbol would hide in the flat plan, and never on a
 * cell a rider that stayed already holds. A head too short for them spreads
 * them over the whole run; a run too short for them all is no place for
 * them (null), and the edit has to find another path or be refused.
 * `corners`, `head` and `oldCells` read from the moved end, so the head is
 * the first `head` cells.
 */
function replaceRiders(
  doc: PlateDocument,
  pipe: PipeElement,
  corners: Cell[],
  head: number,
  oldCells: Cell[],
): PlateDocument | null {
  const cells = runCells(corners);
  const run = cellsOf(corners);
  const z = (i: number) => cells[i].z ?? 0;
  const last = cells.length - 1;
  /** A cell the run leaves or reaches vertically: the foot or head of a
   *  riser. */
  const riser = (i: number) =>
    (i > 0 && z(i) !== z(i - 1)) || (i < last && z(i) !== z(i + 1));
  const inside = (from: number, to: number, held: ReadonlySet<string>) => {
    const slots: Cell[] = [];
    for (let i = Math.max(1, from); i < Math.min(to, last); i++) {
      if (!riser(i) && !held.has(cellKey(cells[i]))) slots.push(cells[i]);
    }
    return slots;
  };
  const order = new Map(oldCells.map((c, i) => [cellKey(c), i]));
  const rank = (c: Cell) => order.get(cellKey(c)) ?? Number.MAX_SAFE_INTEGER;
  /** Each item on a slot of its own, or null when there are too few. */
  const spread = <T>(
    items: T[],
    at: (item: T) => Cell,
    held: ReadonlySet<string>,
  ): Map<T, Cell> | null => {
    if (!items.length) return new Map();
    const onHead = inside(1, head, held);
    const slots =
      onHead.length >= items.length ? onHead : inside(1, cells.length, held);
    if (slots.length < items.length) return null;
    const sorted = [...items].sort((a, b) => rank(at(a)) - rank(at(b)));
    // With at least as many slots as items, these indices never repeat.
    return new Map(
      sorted.map((item, i) => [
        item,
        slots[Math.floor(((i + 1) * slots.length) / (sorted.length + 1))],
      ]),
    );
  };
  const onRun = (doc.symbols ?? []).filter(
    (s) => s.placement.kind === "pipe" && s.placement.pipe === pipe.id,
  );
  const stays = (s: SymbolElement) =>
    s.placement.kind === "pipe" && run.interior.has(cellKey(s.placement.cell));
  const riders = onRun.filter((s) => !stays(s));
  const tags = (pipe.tags ?? []).filter((t) => !run.cells.has(cellKey(t.at)));
  if (!riders.length && !tags.length) return doc;
  const riderCells = spread(
    riders,
    (s) => s.placement.cell,
    new Set(
      onRun.flatMap((s) =>
        stays(s) && s.placement.kind === "pipe"
          ? [cellKey(s.placement.cell)]
          : [],
      ),
    ),
  );
  const tagCells = spread(
    tags,
    (t) => t.at,
    new Set(
      (pipe.tags ?? [])
        .filter((t) => run.cells.has(cellKey(t.at)))
        .map((t) => cellKey(t.at)),
    ),
  );
  if (!riderCells || !tagCells) return null;
  return {
    ...doc,
    symbols: (doc.symbols ?? []).map((s) =>
      riderCells.has(s) && s.placement.kind === "pipe"
        ? { ...s, placement: { ...s.placement, cell: riderCells.get(s)! } }
        : s,
    ),
    pipes: (doc.pipes ?? []).map((p) =>
      p.id === pipe.id
        ? {
            ...p,
            tags: (p.tags ?? []).map((t) =>
              tagCells.has(t) ? { ...t, at: tagCells.get(t)! } : t,
            ),
          }
        : p,
    ),
  };
}

/** The pipe with its path replaced, turned back the way it was stored. */
function withPath(
  pipe: PipeElement,
  corners: Cell[],
  flipped: boolean,
): PipeElement {
  const waypoints = corners.slice(1, -1);
  return {
    ...pipe,
    waypoints: flipped ? waypoints.reverse() : waypoints,
  };
}

const planKey = (c: Cell) => `${c.x},${c.y}`;

/** Symbols the edit made overlap another body on the plan, when they did
 *  not overlap it before: two bodies on one cell put their ports on one
 *  cell, which no run can join, and read as one machine. */
function newOverlaps(before: Symbols, after: Symbols): string[] {
  const free = [...after.values()].filter((s) => s.placement.kind === "cell");
  const cells = new Map<SymbolElement, Set<string>>();
  const planOf = (s: SymbolElement) => {
    if (!cells.has(s)) cells.set(s, new Set(footprintCells(s).map(planKey)));
    return cells.get(s)!;
  };
  const meet = (a: SymbolElement, b: SymbolElement) => {
    const other = planOf(b);
    return [...planOf(a)].some((k) => other.has(k));
  };
  const same = (a: SymbolElement | undefined, b: SymbolElement) =>
    !!a &&
    a.type === b.type &&
    JSON.stringify(a.placement) === JSON.stringify(b.placement) &&
    JSON.stringify(a.props ?? {}) === JSON.stringify(b.props ?? {});
  const found = new Set<string>();
  for (const s of free) {
    if (same(before.get(s.id), s)) continue;
    for (const o of free) {
      if (o.id === s.id || !meet(s, o)) continue;
      const a = before.get(s.id);
      const b = before.get(o.id);
      const already =
        !!a &&
        !!b &&
        a.placement.kind === "cell" &&
        b.placement.kind === "cell" &&
        meet(a, b);
      if (!already) found.add(s.id);
    }
  }
  return [...found];
}

/** Every cell a free symbol's body stands on, with the symbol. */
const bodyCells = (symbols: Symbols): Map<string, string> =>
  new Map(
    [...symbols.values()]
      .filter((s) => s.placement.kind === "cell")
      .flatMap((s) => footprintCells(s).map((c) => [cellKey(c), s.id])),
  );

/**
 * What a run's path runs into on its way: the bodies it goes through, at
 * their height and past its own two end cells, and the cells it passes
 * twice. The backend takes both, but a re-route that adds either draws a
 * pipe through a tank or back over itself, which no author would draw.
 */
function snags(
  pipe: PipeElement | undefined,
  symbols: Symbols,
  bodies: ReadonlyMap<string, string>,
): Set<string> {
  const corners = pipe ? runCorners(pipe, symbols) : null;
  const found = new Set<string>();
  if (!corners) return found;
  const cells = runCells(corners);
  const seen = new Set<string>();
  cells.forEach((c, i) => {
    const key = cellKey(c);
    if (seen.has(key)) found.add(`twice ${key}`);
    seen.add(key);
    const body = i > 0 && i < cells.length - 1 ? bodies.get(key) : undefined;
    if (body) found.add(`body ${body}`);
  });
  return found;
}

/**
 * Makes the runs follow an edit that moved ports: every run with an end on
 * a port whose cell or face changed between `before` and `after` is
 * re-routed (`followHead`, or `followBoth` when both its ends moved), its
 * riders put back on it, and the result checked against the backend's run
 * rules and for `snags` it did not have. A run the re-route leaves broken
 * falls back to stretching its old path (`extendHead`). An edit still
 * breaking a rule or snagging, or putting a body on another, is refused:
 * the caller keeps the plate as it was.
 *
 * Every other run is returned as it was, byte for byte, so an edit that
 * moves nothing is a no-op here.
 */
export function rerouteChanged(
  before: PlateDocument,
  after: PlateDocument,
): Reroute {
  const was = symbolsOf(before);
  const now = symbolsOf(after);
  const overlaps = newOverlaps(was, now);
  if (overlaps.length) {
    return { ok: false, reason: "overlap", elements: overlaps };
  }
  const moved = (end: Endpoint) =>
    end.kind === "port" && anchorKey(end, was) !== anchorKey(end, now);
  const changed = (after.pipes ?? []).filter(
    (p) => moved(p.from) || moved(p.to),
  );
  if (!changed.length) return { ok: true, doc: after, extended: [] };

  const tees = teeCells(after);
  /** `base` with `pipe` on the path `route` gives it, and its riders put
   *  back as they stood in `after`, then re-placed onto the new path; null
   *  when there is no path or no room on it for them. The path is worked
   *  with the moved end first (`flip`) and stored back the way the pipe
   *  runs. */
  const follow = (
    base: PlateDocument,
    pipe: PipeElement,
    route: (p: PipeElement) => Path | null,
  ): PlateDocument | null => {
    const flipped = !moved(pipe.from);
    const oriented = flipped ? flip(pipe) : pipe;
    const path = route(oriented);
    if (!path) return null;
    const old = runCorners(oriented, was);
    const oldCells = old && aligned(old) ? runCells(old) : [];
    const next = withPath(pipe, path.corners, flipped);
    const placed: PlateDocument = {
      ...base,
      symbols: (base.symbols ?? []).map((s) =>
        s.placement.kind === "pipe" && s.placement.pipe === pipe.id
          ? (now.get(s.id) ?? s)
          : s,
      ),
      pipes: (base.pipes ?? []).map((p) => (p.id === pipe.id ? next : p)),
    };
    return replaceRiders(placed, next, path.corners, path.head, oldCells);
  };

  const bodiesBefore = bodyCells(was);
  const bodiesAfter = bodyCells(now);
  /** Where a re-routed run may go: off every body and the symbols riding
   *  the other runs, overhead unless the plate is flat. */
  const roomFor = (pipe: PipeElement): Room => ({
    blocked: new Set([
      ...bodiesAfter.keys(),
      ...(after.symbols ?? []).flatMap((s) =>
        s.placement.kind === "pipe" && s.placement.pipe !== pipe.id
          ? [cellKey(s.placement.cell)]
          : [],
      ),
    ]),
    high: after.projection !== "flat",
  });

  // A run without a path keeps its old one here, and the check below finds
  // it broken.
  let doc = after;
  for (const pipe of changed) {
    const both = moved(pipe.from) && moved(pipe.to);
    const pins = tees.get(pipe.id) ?? new Set<string>();
    const room = roomFor(pipe);
    doc =
      follow(doc, pipe, (p) =>
        both
          ? followBoth(p, was, now, pins, room)
          : followHead(p, was, now, pins, room),
      ) ?? doc;
  }

  const pipeIn = (d: PlateDocument, id: string) =>
    d.pipes?.find((p) => p.id === id);
  const extended: string[] = [];
  const broken: string[] = [];
  for (const pipe of changed) {
    const scope = new Set([pipe.id]);
    const baseline = runViolations(before, scope);
    const had = snags(pipeIn(before, pipe.id), was, bodiesBefore);
    const holds = (d: PlateDocument | null): d is PlateDocument =>
      !!d &&
      !fresh(runViolations(d, scope), baseline).length &&
      [...snags(pipeIn(d, pipe.id), now, bodiesAfter)].every((s) => had.has(s));
    if (holds(doc)) continue;
    const both = moved(pipe.from) && moved(pipe.to);
    if (!both) {
      const room = roomFor(pipe);
      const retry = follow(doc, pipe, (p) => extendHead(p, was, now, room));
      if (holds(retry)) {
        doc = retry;
        extended.push(pipe.id);
        continue;
      }
    }
    broken.push(pipe.id);
  }
  if (broken.length)
    return { ok: false, reason: "unroutable", elements: broken };
  return { ok: true, doc, extended };
}
