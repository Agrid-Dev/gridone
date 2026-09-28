import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { freshOverlaps, pipeOverlaps } from "./occupancy";
import type { Cell, PipeElement, SymbolElement } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { runCells } from "@/components/synoptic/runs";
import { footprintCells } from "@/components/synoptic/symbols/footprint";
import { canRotate, moveSymbol, rotateSymbol, updateSymbol } from "./document";
import { rerouteChanged, type Reroute } from "./reroute";
import {
  cellKey,
  runCorners,
  runViolations,
  type RunViolation,
  direction,
} from "./runRules";

const PLATES = [
  "ecs-est",
  "ecs-ouest",
  "production-chaud",
  "production-froid",
] as const;

const load = (name: string): PlateDocument =>
  JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        `../../../../../../docs/specs/synoptic/${name}.json`,
      ),
      "utf8",
    ),
  );

const onSymbol = (pipe: PipeElement, id: string) =>
  [pipe.from, pipe.to].some((e) => e.kind === "port" && e.symbol === id);

const key = (v: RunViolation) => `${v.element}|${v.rule}`;

/** The violations `after` has that `before` did not. */
function added(after: RunViolation[], before: RunViolation[]): string[] {
  const left = new Map<string, number>();
  for (const v of before) left.set(key(v), (left.get(key(v)) ?? 0) + 1);
  return after.map(key).filter((k) => {
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    return n === 0;
  });
}

type Case = {
  plate: string;
  symbol: string;
  label: string;
  after: PlateDocument;
};

/** Every free symbol with a run on it, moved -3..3 cells each way and
 *  turned the three other ways: the edits the canvas and the inspector
 *  make. */
function cases(plates: Map<string, PlateDocument>): Case[] {
  const found: Case[] = [];
  for (const [plate, doc] of plates) {
    for (const symbol of doc.symbols ?? []) {
      if (symbol.placement.kind !== "cell") continue;
      if (!(doc.pipes ?? []).some((p) => onSymbol(p, symbol.id))) continue;
      const { cell } = symbol.placement;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          if (!dx && !dy) continue;
          const to: Cell = { ...cell, x: cell.x + dx, y: cell.y + dy };
          found.push({
            plate,
            symbol: symbol.id,
            label: `${symbol.id} by (${dx},${dy})`,
            after: moveSymbol(doc, symbol.id, to),
          });
        }
      }
      if (!canRotate(symbol)) continue;
      let turned = doc;
      for (let turn = 1; turn <= 3; turn++) {
        turned = rotateSymbol(turned, symbol.id);
        found.push({
          plate,
          symbol: symbol.id,
          label: `${symbol.id} turned ${turn}`,
          after: turned,
        });
      }
    }
  }
  return found;
}

/** What a run passes through that no author draws: a body, past its own
 *  two end cells, and a cell twice. Worked out here from the cells, not
 *  asked of the module. */
function snagsOf(doc: PlateDocument, id: string): Set<string> {
  const pipe = doc.pipes?.find((p) => p.id === id);
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const corners = pipe ? runCorners(pipe, symbols) : null;
  const found = new Set<string>();
  if (!corners) return found;
  const bodies = new Map<string, string>();
  for (const s of doc.symbols ?? []) {
    if (s.placement.kind !== "cell") continue;
    for (const c of footprintCells(s)) bodies.set(cellKey(c), s.id);
  }
  const cells = runCells(corners).map(cellKey);
  cells.forEach((k, i) => {
    if (cells.indexOf(k) !== i) found.add(`${k} twice`);
    const body = bodies.get(k);
    if (body && i > 0 && i < cells.length - 1) found.add(`through ${body}`);
  });
  return found;
}

/** The measure of the rule on each plate, pinned so a change to it is
 *  seen: the edits taken, those taken by stretching the old path, and
 *  those refused for putting a body on another or for leaving a run no
 *  clean way to follow (a body landed on it, a port facing a body). */
const TALLIES: Record<(typeof PLATES)[number], Record<string, number>> = {
  "ecs-est": { accepted: 542, extended: 0, overlap: 37, unroutable: 228 },
  "ecs-ouest": { accepted: 562, extended: 4, overlap: 48, unroutable: 299 },
  "production-chaud": {
    accepted: 551,
    extended: 16,
    overlap: 0,
    unroutable: 157,
  },
  "production-froid": {
    accepted: 276,
    extended: 20,
    overlap: 0,
    unroutable: 177,
  },
};

describe("rerouteChanged on the committed plates", () => {
  // One test per plate, every fault collected into one assertion: a
  // per-case `expect` would multiply the cost past what CI grants a test.
  it.each(PLATES)(
    "%s: leaves every edit it takes free of new run violations and snags, and touches only the runs on the moved symbol",
    (name) => {
      const before = load(name);
      const snapshot = JSON.stringify(before);
      const overlaps = pipeOverlaps(before);
      const failures: string[] = [];
      const tally = { accepted: 0, extended: 0, overlap: 0, unroutable: 0 };
      for (const { symbol, label, after } of cases(new Map([[name, before]]))) {
        const proposed = JSON.stringify(after);
        const result = rerouteChanged(before, after);
        if (
          JSON.stringify(before) !== snapshot ||
          JSON.stringify(after) !== proposed
        ) {
          failures.push(`${label}: mutated an input document`);
        }
        if (!result.ok) {
          tally[result.reason] += 1;
          continue;
        }
        tally.accepted += 1;
        if (freshOverlaps(pipeOverlaps(result.doc), overlaps).length) {
          failures.push(`${label}: introduced overlapping cells`);
        }
        if (result.extended.length) tally.extended += 1;
        const pipes = result.doc.pipes ?? [];
        const changed = new Set(
          pipes.filter((p, i) => p !== after.pipes![i]).map((p) => p.id),
        );
        for (const p of pipes) {
          if (!changed.has(p.id)) continue;
          if (!onSymbol(p, symbol)) {
            failures.push(`${label}: re-routed ${p.id}, not on it`);
          }
          const had = snagsOf(before, p.id);
          const snags = [...snagsOf(result.doc, p.id)].filter(
            (snag) => !had.has(snag),
          );
          if (snags.length) failures.push(`${label}: ${p.id} ${snags}`);
        }
        const fresh = added(
          runViolations(result.doc, changed),
          runViolations(before, changed),
        );
        if (fresh.length) failures.push(`${label}: ${fresh.join(", ")}`);
      }
      expect(failures).toEqual([]);
      expect(tally).toEqual(TALLIES[name]);
    },
  );
});

// A small plate: a tank (1 × 2, dhw_out on +x at its origin) feeding a
// plate exchanger (1 × 1, primary_in on -x) five cells to its right.
const tank: SymbolElement = {
  id: "t",
  type: "tank",
  placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation: 0 },
  props: { capacity: "" },
  bindings: {},
};
const exchanger: SymbolElement = {
  id: "e",
  type: "plate_exchanger",
  placement: { kind: "cell", cell: { x: 5, y: 0 }, rotation: 0 },
  props: {},
  bindings: {},
};
const feed: PipeElement = {
  id: "feed",
  fluid: "dhw",
  from: { kind: "port", symbol: "t", port: "dhw_out" },
  to: { kind: "port", symbol: "e", port: "primary_in" },
  waypoints: [],
  flow: null,
  tags: [],
};
const plate = (
  extra: Partial<Pick<PlateDocument, "symbols" | "pipes">> = {},
): PlateDocument => ({
  version: 1,
  name: "p",
  description: null,
  projection: "isometric",
  symbols: [tank, exchanger, ...(extra.symbols ?? [])],
  pipes: [feed, ...(extra.pipes ?? [])],
  labels: [],
});

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
const pipeOf = (doc: PlateDocument, id: string) =>
  doc.pipes!.find((p) => p.id === id)!;
const cellsOfPipe = (doc: PlateDocument, id: string) => {
  const symbols = new Map(doc.symbols!.map((s) => [s.id, s]));
  return runCells(runCorners(pipeOf(doc, id), symbols)!).map(cellKey);
};

describe("rerouteChanged", () => {
  it.each(["flat", "isometric"] as const)(
    "routes around stationary pipes in %s",
    (projection) => {
      const obstacle: PipeElement = {
        id: "obstacle",
        fluid: "cold_water",
        from: { kind: "cell", cell: at(1, 1) },
        to: { kind: "cell", cell: at(4, 1) },
      };
      const before = { ...plate({ pipes: [obstacle] }), projection };
      const result = rerouteChanged(before, moveSymbol(before, "t", at(0, 3)));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(pipeOverlaps(result.doc)).toEqual([]);
      expect(pipeOf(result.doc, obstacle.id)).toBe(obstacle);
      expect(runViolations(result.doc)).toEqual([]);
    },
  );

  it("reserves earlier paths when several connected pipes move together", () => {
    const second: PipeElement = {
      id: "second",
      fluid: "dhw_loop",
      from: { kind: "port", symbol: "t", port: "dhw_in" },
      to: { kind: "cell", cell: at(5, 1) },
    };
    const before = plate({ pipes: [second] });
    const result = rerouteChanged(before, moveSymbol(before, "t", at(0, 3)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pipeOverlaps(result.doc)).toEqual([]);
    expect(runViolations(result.doc)).toEqual([]);
    expect(pipeOf(result.doc, "feed")).not.toBe(feed);
    expect(pipeOf(result.doc, "second")).not.toBe(second);
  });

  it("allows pre-existing overlaps to remain without adding shared cells", () => {
    const crossing: PipeElement = {
      id: "crossing",
      fluid: "cold_water",
      from: { kind: "cell", cell: at(4, -2) },
      to: { kind: "cell", cell: at(4, 2) },
    };
    const before = plate({ pipes: [crossing] });
    const overlaps = pipeOverlaps(before);
    expect(overlaps).toHaveLength(1);
    const result = rerouteChanged(before, moveSymbol(before, "t", at(-1, 0)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pipeOverlaps(result.doc)).toEqual(overlaps);
  });
  it("returns the edited plate itself when no port moved", () => {
    const before = plate();
    const after = { ...before, name: "renamed" };
    const result = rerouteChanged(before, after);
    expect(result).toEqual({ ok: true, doc: after, extended: [] });
    // Mutant: a pass that rebuilt every run would hand back a copy.
    if (result.ok) expect(result.doc).toBe(after);
  });

  it("routes a run with no bend whole, from the moved port to its far end", () => {
    const before = plate();
    const after = moveSymbol(before, "e", at(7, 3));
    const result = rerouteChanged(before, after);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runViolations(result.doc)).toEqual([]);
    const cells = cellsOfPipe(result.doc, "feed");
    expect(cells[0]).toBe(cellKey(at(0, 0)));
    expect(cells.at(-1)).toBe(cellKey(at(7, 3)));
  });

  it("keeps the cell a branch tees onto, so the branch stays on its trunk", () => {
    const branch: PipeElement = {
      id: "branch",
      fluid: "dhw",
      from: { kind: "pipe", pipe: "feed", cell: at(2, 0) },
      to: { kind: "cell", cell: at(2, 3) },
      waypoints: [],
      flow: null,
      tags: [],
    };
    const before = plate({ pipes: [branch] });
    const result = rerouteChanged(before, moveSymbol(before, "e", at(7, 3)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runViolations(result.doc)).toEqual([]);
    // Mutant: routing the run whole from the exchanger drops (2, 0).
    expect(cellsOfPipe(result.doc, "feed")).toContain(cellKey(at(2, 0)));
    expect(pipeOf(result.doc, "branch")).toBe(branch);
  });

  it("puts a rider that fell off back inside the new run", () => {
    const pump: SymbolElement = {
      id: "pump",
      type: "pump",
      placement: { kind: "pipe", pipe: "feed", cell: at(4, 0) },
      props: {},
      bindings: {},
    };
    const before = plate({ symbols: [pump] });
    const result = rerouteChanged(before, moveSymbol(before, "e", at(6, 4)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runViolations(result.doc)).toEqual([]);
    const placed = result.doc.symbols!.find((s) => s.id === "pump")!;
    const cells = cellsOfPipe(result.doc, "feed");
    expect(cells.slice(1, -1)).toContain(cellKey(placed.placement.cell));
  });

  it("moves a tag that fell off onto the run with it", () => {
    const tagged: PipeElement = {
      ...feed,
      tags: [{ id: "tt", at: at(4, 0), label: "T" }],
    };
    const before: PlateDocument = { ...plate(), pipes: [tagged] };
    const result = rerouteChanged(before, moveSymbol(before, "e", at(6, 4)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runViolations(result.doc)).toEqual([]);
    const tag = pipeOf(result.doc, "feed").tags![0];
    expect(cellsOfPipe(result.doc, "feed")).toContain(cellKey(tag.at));
  });

  it("routes a run with both ends on the moved symbol from one port to the other", () => {
    const loop: PipeElement = {
      id: "loop",
      fluid: "dhw_loop",
      from: { kind: "port", symbol: "t", port: "dhw_out" },
      to: { kind: "port", symbol: "t", port: "dhw_in" },
      waypoints: [at(2, 0), at(2, 1)],
      flow: null,
      tags: [],
    };
    const before: PlateDocument = { ...plate(), pipes: [loop] };
    expect(runViolations(before)).toEqual([]);
    const result = rerouteChanged(before, moveSymbol(before, "t", at(0, 3)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(runViolations(result.doc)).toEqual([]);
    expect(cellsOfPipe(result.doc, "loop")[0]).toBe(cellKey(at(0, 3)));
  });

  it("refuses an edit that puts a body on another, naming the moved one", () => {
    const before = plate();
    expect(rerouteChanged(before, moveSymbol(before, "e", at(0, 1)))).toEqual({
      ok: false,
      reason: "overlap",
      elements: ["e"],
    });
  });

  it("keeps a re-routed run on the floor of a flat plate, the long way round where a hop would be shorter", () => {
    // A collector standing across the way, its top end twelve cells up.
    // Over it would be shorter, but a flat plate refuses any height: the
    // run goes round its end, on the floor.
    const bar: SymbolElement = {
      id: "bar",
      type: "collector",
      placement: { kind: "cell", cell: at(3, -11), rotation: 0 },
      props: { axis: "y", length: 42, ports: {} },
      bindings: {},
    };
    const before: PlateDocument = {
      ...plate({ symbols: [bar] }),
      projection: "flat",
    };
    const result = rerouteChanged(before, moveSymbol(before, "t", at(0, 1)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const run = result.doc.pipes!.find((p) => p.id === "feed")!;
    expect(run.waypoints!.every((c) => (c.z ?? 0) === 0)).toBe(true);
    const symbols = new Map(result.doc.symbols!.map((x) => [x.id, x]));
    const cells = runCells(runCorners(run, symbols)!);
    expect(cells.some((c) => c.x === 3 && c.y > -12)).toBe(false);
  });

  it("lets two bodies that already overlapped move while they still do", () => {
    // A spare exchanger, with no run, stored over the tank's lower cell.
    const spare: SymbolElement = {
      ...exchanger,
      id: "x",
      placement: { kind: "cell", cell: at(0, 1), rotation: 0 },
    };
    const before = plate({ symbols: [spare] });
    const result = rerouteChanged(before, moveSymbol(before, "x", at(0, 0)));
    // The two overlapped before the edit: the edit is judged on what it
    // breaks, not on what the plate already carried.
    expect(result.ok).toBe(true);
  });

  it("does not hold a run the edit did not break to the rules it already broke", () => {
    // A stored plate may carry a run the backend would refuse (a diagonal
    // left by an older editor). Moving an unrelated symbol takes the edit.
    const broken: PipeElement = {
      id: "broken",
      fluid: "dhw",
      from: { kind: "cell", cell: at(10, 10) },
      to: { kind: "cell", cell: at(12, 12) },
      waypoints: [],
      flow: null,
      tags: [],
    };
    const before = plate({ pipes: [broken] });
    const result = rerouteChanged(before, moveSymbol(before, "e", at(7, 3)));
    expect(result.ok).toBe(true);
  });
});

describe("further cases, each pinned by a mutation", () => {
  // The plates below are small and drawn by hand: a tank `t` (1 x 2, dhw_out
  // on +x at its origin, dhw_in on +x one cell below) and a plate exchanger
  // `e` (1 x 1, primary_in on -x), joined by `feed`. Every expected path was
  // worked out from the rules the module states (pin on the first tee cell,
  // else on the second bend, else route whole; arrive at the pin in line with
  // the kept part), not read back from the module.

  const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
  const tank: SymbolElement = {
    id: "t",
    type: "tank",
    placement: { kind: "cell", cell: at(0, 0), rotation: 0 },
    props: { capacity: "" },
    bindings: {},
  };
  const exchanger = (cell: Cell): SymbolElement => ({
    id: "e",
    type: "plate_exchanger",
    placement: { kind: "cell", cell, rotation: 0 },
    props: {},
    bindings: {},
  });
  const feed = (waypoints: Cell[] = []): PipeElement => ({
    id: "feed",
    fluid: "dhw",
    from: { kind: "port", symbol: "t", port: "dhw_out" },
    to: { kind: "port", symbol: "e", port: "primary_in" },
    waypoints,
    flow: null,
    tags: [],
  });
  /** A branch teeing onto `feed` at `cell`, out to a free cell. */
  const branch = (id: string, cell: Cell, end: Cell): PipeElement => ({
    id,
    fluid: "dhw",
    from: { kind: "pipe", pipe: "feed", cell },
    to: { kind: "cell", cell: end },
    waypoints: [],
    flow: null,
    tags: [],
  });
  const rider = (id: string, cell: Cell, pipe = "feed"): SymbolElement => ({
    id,
    type: "pump",
    placement: { kind: "pipe", pipe, cell },
    props: {},
    bindings: {},
  });
  const plate = (
    symbols: SymbolElement[],
    pipes: PipeElement[],
  ): PlateDocument => ({
    version: 1,
    name: "p",
    description: null,
    projection: "isometric",
    symbols,
    pipes,
    labels: [],
  });

  /** Out along x, down four, across, back up and on to the exchanger at
   *  (10,0): four bends, cells 0..18 from the tank. */
  const LONG = [at(3, 0), at(3, 4), at(7, 4), at(7, 0)];

  const pipeOf = (doc: PlateDocument, id: string) =>
    doc.pipes!.find((p) => p.id === id)!;
  const symbolOf = (doc: PlateDocument, id: string) =>
    doc.symbols!.find((s) => s.id === id)!;
  /** The cells of a stored run, as keys, from its `from` end. */
  const cellsOf = (doc: PlateDocument, id: string): string[] => {
    const symbols = new Map(doc.symbols!.map((s) => [s.id, s]));
    return runCells(runCorners(pipeOf(doc, id), symbols)!).map(cellKey);
  };
  function accepted(result: Reroute): PlateDocument {
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result)}`);
    return result.doc;
  }

  describe("rerouteChanged: where the kept part starts", () => {
    it("pins the first cell another run tees onto, and keeps the run past it as it was", () => {
      const before = plate(
        [tank, exchanger(at(10, 0))],
        [
          feed(LONG),
          branch("b1", at(3, 2), at(1, 2)),
          branch("b2", at(5, 4), at(5, 6)),
        ],
      );
      const result = rerouteChanged(before, moveSymbol(before, "t", at(0, -3)));
      expect(result.ok && result.extended).toEqual([]);
      const doc = accepted(result);
      expect(runViolations(doc)).toEqual([]);
      // Out of the moved port at (0,-3), round to arrive at the first tee
      // (3,2) from above; from there on the stored bends, untouched. Mutant:
      // pinning on the last tee (5,4) drops (3,2) and strands branch b1.
      expect(pipeOf(doc, "feed").waypoints).toEqual([
        at(1, -3),
        at(1, 1),
        at(3, 1),
        at(3, 4),
        at(7, 4),
        at(7, 0),
      ]);
      // The branches are not touched, byte for byte.
      expect(pipeOf(doc, "b1")).toBe(pipeOf(before, "b1"));
      expect(pipeOf(doc, "b2")).toBe(pipeOf(before, "b2"));
    });

    it("pins the second bend of a run of three bends or more when nothing tees onto it", () => {
      const before = plate([tank, exchanger(at(10, 0))], [feed(LONG)]);
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(0, -3))),
      );
      expect(runViolations(doc)).toEqual([]);
      // (3,4) is the second bend: the new head arrives there along +x, in
      // line with the kept (3,4) -> (7,4), so (3,4) reads as no corner at
      // all. Mutants: pinning the first bend or the third route elsewhere.
      expect(pipeOf(doc, "feed").waypoints).toEqual([
        at(1, -3),
        at(1, 4),
        at(7, 4),
        at(7, 0),
      ]);
    });

    it("routes a run of two bends whole, from the moved port to its far end", () => {
      // Out +x, down at x = 5, on to the exchanger's -x face at (10,3).
      const before = plate(
        [tank, exchanger(at(10, 3))],
        [feed([at(5, 0), at(5, 3)])],
      );
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(0, -2))),
      );
      expect(runViolations(doc)).toEqual([]);
      // The old bends at x = 5 are gone: the run is the router's own, x first
      // since the plan is longer along x. Mutant: pinning a two-bend run on
      // its second bend keeps (5,3).
      expect(pipeOf(doc, "feed").waypoints).toEqual([at(9, -2), at(9, 3)]);
    });

    it("arrives at the pin moving the way the kept part leaves it, never folding back", () => {
      const before = plate(
        [tank, exchanger(at(10, 0))],
        [
          feed(LONG),
          branch("b1", at(3, 2), at(1, 2)),
          branch("b2", at(5, 4), at(5, 6)),
        ],
      );
      // The tank goes below the pin (3,2), whose kept part leaves along +y:
      // the shortest way in comes up from below and would fold back over
      // (3,3) and (3,4).
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(2, 6))),
      );
      expect(runViolations(doc)).toEqual([]);
      const cells = cellsOf(doc, "feed");
      const pin = cells.indexOf(cellKey(at(3, 2)));
      const cell = (k: string) => {
        const [x, y, z] = k.split(",").map(Number);
        return { x, y, z };
      };
      expect(pin).toBeGreaterThan(0);
      expect(direction(cell(cells[pin - 1]), cell(cells[pin]))).toBe("+y");
      expect(direction(cell(cells[pin]), cell(cells[pin + 1]))).toBe("+y");
    });
  });

  describe("rerouteChanged: which way the run is stored", () => {
    it("re-routes from a moved `to` end and stores the run the way it ran", () => {
      const before = plate([tank, exchanger(at(10, 0))], [feed(LONG)]);
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "e", at(10, 6))),
      );
      const moved = pipeOf(doc, "feed");
      expect(moved.from).toEqual(feed().from);
      expect(moved.to).toEqual(feed().to);
      // Worked from the exchanger end (pin on (7,4), the second bend from
      // there), then turned back: from the tank. Mutant: storing the worked
      // order leaves a diagonal from the tank, and the edit is refused.
      expect(moved.waypoints).toEqual([at(3, 0), at(3, 4), at(9, 4), at(9, 6)]);
      expect(runViolations(doc)).toEqual([]);
    });

    it("re-routes the runs of a symbol turned in place, whose ports kept their cell", () => {
      // A 1 x 1 exchanger turned a quarter: primary_in stays on (5,0) but
      // faces -y. Mutant: a port judged moved by its cell alone leaves the
      // run entering through the old face, which the backend refuses.
      const before = plate([tank, exchanger(at(5, 0))], [feed()]);
      const doc = accepted(rerouteChanged(before, rotateSymbol(before, "e")));
      expect(runViolations(doc)).toEqual([]);
      const cells = cellsOf(doc, "feed");
      expect(cells.at(-2)).toBe(cellKey(at(5, -1)));
    });

    it("routes a run whose two ends both moved through the tee cells, in the order it crossed them", () => {
      // A loop from the tank's dhw_out round to its dhw_in, with a branch
      // off each leg.
      const loop: PipeElement = {
        ...feed([at(4, 0), at(4, 1)]),
        fluid: "dhw_loop",
        to: { kind: "port", symbol: "t", port: "dhw_in" },
      };
      const before = plate(
        [tank],
        [
          loop,
          branch("b1", at(2, 0), at(2, -3)),
          branch("b2", at(3, 1), at(3, 4)),
        ],
      );
      expect(runViolations(before)).toEqual([]);
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(0, 5))),
      );
      expect(runViolations(doc)).toEqual([]);
      // Up to (2,0), across to (3,1), down and back into dhw_in. Mutant: no
      // tee cells on the way strands both branches. Keep clear of each
      // branch beyond the one cell where it joins the trunk.
      expect(pipeOverlaps(doc)).toEqual([]);
      expect(pipeOf(doc, "feed").waypoints).toEqual([
        at(2, 5),
        at(2, 0),
        at(3, 0),
        at(3, 1),
        at(4, 1),
        at(4, 6),
      ]);
    });
  });

  describe("rerouteChanged: riders and tags", () => {
    it("puts riders that fell off onto the new head, in the order the old run carried them", () => {
      const before = plate(
        [
          tank,
          exchanger(at(10, 0)),
          rider("a", at(2, 0)),
          rider("b", at(3, 0)),
          rider("k", at(6, 4)),
        ],
        [
          feed(LONG),
          branch("b1", at(3, 2), at(1, 2)),
          branch("b2", at(5, 4), at(5, 6)),
        ],
      );
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(0, -3))),
      );
      expect(runViolations(doc)).toEqual([]);
      const cells = cellsOf(doc, "feed");
      const head = cells.slice(1, cells.indexOf(cellKey(at(3, 2))));
      const where = (id: string) => cellKey(symbolOf(doc, id).placement.cell);
      // Both on the new head, spread along it, `a` still before `b`. Mutants:
      // spreading over the whole run puts `b` on the kept part; sorting the
      // other way swaps them.
      expect(where("a")).toBe(cellKey(at(1, -1)));
      expect(where("b")).toBe(cellKey(at(1, 1)));
      expect(head).toContain(where("a"));
      expect(head.indexOf(where("a"))).toBeLessThan(head.indexOf(where("b")));
      // A rider on the kept part stays where it was, object and all.
      expect(symbolOf(doc, "k")).toBe(symbolOf(before, "k"));
    });

    it("keeps riders off the foot and head of a riser on the new head", () => {
      // Out at the floor, up at x = 4, overhead to x = 8, down, on to the
      // exchanger. Moving the tank below makes the new head climb at once.
      const before = plate(
        [
          tank,
          exchanger(at(12, 0)),
          rider("r1", at(1, 0)),
          rider("r2", at(2, 0)),
          rider("r3", at(3, 0)),
        ],
        [feed([at(4, 0), at(4, 0, 1), at(8, 0, 1), at(8, 0)])],
      );
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(0, 3))),
      );
      expect(runViolations(doc)).toEqual([]);
      const placed = ["r1", "r2", "r3"].map((id) =>
        cellKey(symbolOf(doc, id).placement.cell),
      );
      // The head climbs at (1,3): (1,3,0) and (1,3,1) are its riser. Mutant:
      // counting them as slots puts r1 on (1,3,1), hidden in the plan.
      expect(placed).toEqual(["1,1,1", "1,0,1", "2,0,1"]);
    });

    it("puts back inside a rider the moved port landed on", () => {
      // The tank's port moves onto the pump's cell, which becomes the run's
      // first cell: an end, where the backend refuses an inline symbol.
      const before = plate(
        [tank, exchanger(at(8, 0)), rider("p", at(3, 0))],
        [feed()],
      );
      const result = rerouteChanged(before, moveSymbol(before, "t", at(3, 0)));
      expect(result.ok && result.extended).toEqual([]);
      const doc = accepted(result);
      expect(runViolations(doc)).toEqual([]);
      expect(cellsOf(doc, "feed").slice(1, -1)).toContain(
        cellKey(symbolOf(doc, "p").placement.cell),
      );
    });

    it("puts a tag that fell off onto the new head and leaves one still on the run", () => {
      const tagged: PipeElement = {
        ...feed(LONG),
        tags: [
          { id: "tg1", at: at(2, 0), label: "T1" },
          { id: "tg2", at: at(7, 2), label: "T2" },
        ],
      };
      const before = plate(
        [tank, exchanger(at(10, 0))],
        [tagged, branch("b1", at(3, 2), at(1, 2))],
      );
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(0, -3))),
      );
      expect(runViolations(doc)).toEqual([]);
      const [tg1, tg2] = pipeOf(doc, "feed").tags!;
      const cells = cellsOf(doc, "feed");
      expect(cells.slice(1, cells.indexOf(cellKey(at(3, 2))))).toContain(
        cellKey(tg1.at),
      );
      expect(tg2).toBe(tagged.tags![1]);
    });
  });

  describe("rerouteChanged: the fallback and the refusals", () => {
    it("stretches the old run from the moved port when a routed one has no room for its riders", () => {
      // Six pumps on a straight run; the tank goes up and in, where a routed
      // run has five cells inside it: the old run is kept whole, every pump
      // where it was, and a head goes round from the port to behind the old
      // port cell, clear of the tank and of the run it joins.
      const pumps = [1, 2, 3, 4, 5, 6].map((x) => rider(`p${x}`, at(x, 0)));
      const before = plate([tank, exchanger(at(8, 0)), ...pumps], [feed()]);
      const result = rerouteChanged(before, moveSymbol(before, "t", at(5, -3)));
      expect(result.ok && result.extended).toEqual(["feed"]);
      const doc = accepted(result);
      expect(runViolations(doc)).toEqual([]);
      const cells = cellsOf(doc, "feed");
      for (let x = 0; x <= 8; x++) {
        expect(cells).toContain(cellKey(at(x, 0)));
      }
      for (const pump of pumps) {
        expect(symbolOf(doc, pump.id)).toBe(symbolOf(before, pump.id));
      }
      // Clear: never through the tank's lower cell, never a cell twice.
      expect(cells.slice(1, -1)).not.toContain(cellKey(at(5, -2)));
      expect(new Set(cells).size).toBe(cells.length);
    });

    it("refuses a move that leaves a run no clean way to follow", () => {
      // The tank lands right against the exchanger: its port faces the
      // exchanger's body, so any run out of it goes through a body, and the
      // pump between them has nowhere to go. Stretching the old run would
      // loop through both bodies and back over itself: refused.
      const before = plate(
        [tank, exchanger(at(5, 0)), rider("p", at(3, 0))],
        [feed()],
      );
      const result = rerouteChanged(before, moveSymbol(before, "t", at(4, 0)));
      expect(result).toEqual({
        ok: false,
        reason: "unroutable",
        elements: ["feed"],
      });
    });

    it("routes a run that already carried a stranded branch, without holding the old fault against it", () => {
      // `off` tees onto a cell `feed` never crossed: a fault the plate had
      // before the edit, and still has after it.
      const before = plate(
        [tank, exchanger(at(5, 0))],
        [feed(), branch("off", at(2, 1), at(2, 4))],
      );
      expect(runViolations(before)).toEqual([
        { element: "off", rule: "off_polyline" },
      ]);
      const result = rerouteChanged(before, moveSymbol(before, "e", at(7, 2)));
      // Mutant: judging the edit on every violation, not on the new ones,
      // falls back to stretching the run (or refuses it) for a fault it did
      // not make.
      expect(result.ok && result.extended).toEqual([]);
    });

    it("refuses an edit that takes away a port a run is attached to, naming the run", () => {
      const collector: SymbolElement = {
        id: "c",
        type: "collector",
        placement: { kind: "cell", cell: at(0, 0), rotation: 0 },
        props: {
          axis: "x",
          length: 4,
          ports: { out_1: { offset: 2, side: "+y" } },
        },
        bindings: {},
      };
      const run: PipeElement = {
        id: "run",
        fluid: "dhw",
        from: { kind: "port", symbol: "c", port: "out_1" },
        to: { kind: "cell", cell: at(2, 4) },
        waypoints: [],
        flow: null,
        tags: [],
      };
      const before = plate([collector], [run]);
      const after = updateSymbol(before, "c", (s) => ({
        ...s,
        props: { axis: "x", length: 4, ports: {} },
      }));
      expect(rerouteChanged(before, after)).toEqual({
        ok: false,
        reason: "unroutable",
        elements: ["run"],
      });
    });

    it("refuses a turn that swings a body onto its neighbour", () => {
      // A 2 x 2 heat pump turned a quarter covers x -1..0; a tank stands on
      // x = -1.
      const pac: SymbolElement = {
        id: "pac",
        type: "heat_pump",
        placement: { kind: "cell", cell: at(0, 0), rotation: 0 },
        props: {},
        bindings: {},
      };
      const neighbour = {
        ...tank,
        placement: { ...tank.placement, cell: at(-1, 0) },
      };
      const before = plate([pac, neighbour], []);
      expect(rerouteChanged(before, rotateSymbol(before, "pac"))).toEqual({
        ok: false,
        reason: "overlap",
        elements: ["pac"],
      });
    });

    it("refuses a collector made longer onto a neighbour", () => {
      const collector: SymbolElement = {
        id: "c",
        type: "collector",
        placement: { kind: "cell", cell: at(0, 5), rotation: 0 },
        props: { axis: "x", length: 3, ports: {} },
        bindings: {},
      };
      const before = plate(
        [
          collector,
          { ...tank, placement: { ...tank.placement, cell: at(4, 5) } },
        ],
        [],
      );
      const longer = (length: number) =>
        updateSymbol(before, "c", (s) => ({
          ...s,
          props: { ...s.props, length },
        }));
      expect(rerouteChanged(before, longer(4)).ok).toBe(true);
      expect(rerouteChanged(before, longer(5))).toEqual({
        ok: false,
        reason: "overlap",
        elements: ["c"],
      });
    });

    it("names a symbol placed onto a body, and not the body it landed on", () => {
      const before = plate([tank], []);
      const after: PlateDocument = {
        ...before,
        symbols: [...before.symbols!, exchanger(at(0, 1))],
      };
      expect(rerouteChanged(before, after)).toEqual({
        ok: false,
        reason: "overlap",
        elements: ["e"],
      });
    });

    it("forgives only the overlap a body already had, not a new one", () => {
      // The exchanger already sat on the tank's lower cell. Moving it along
      // the tank keeps that overlap; moving it onto a third body is refused.
      const third = {
        ...exchanger(at(0, 3)),
        id: "x",
      };
      const before = plate([tank, exchanger(at(0, 1)), third], []);
      expect(rerouteChanged(before, moveSymbol(before, "e", at(0, 0))).ok).toBe(
        true,
      );
      // Mutant: excusing a body that overlapped anything before lets it land
      // on `x` as well.
      expect(rerouteChanged(before, moveSymbol(before, "e", at(0, 3)))).toEqual(
        {
          ok: false,
          reason: "overlap",
          elements: ["e"],
        },
      );
    });
  });

  describe("rerouteChanged: riders that fell off", () => {
    it("never puts one on the cell of a rider that stayed", () => {
      const before = plate(
        [
          tank,
          exchanger(at(8, 0)),
          rider("p1", at(1, 0)),
          rider("v", at(5, 0)),
        ],
        [feed()],
      );
      const doc = accepted(
        rerouteChanged(before, moveSymbol(before, "t", at(2, 0))),
      );
      const cells = doc
        .symbols!.filter((s) => s.placement.kind === "pipe")
        .map((s) =>
          s.placement.kind === "pipe" ? cellKey(s.placement.cell) : "",
        );
      expect(new Set(cells).size).toBe(cells.length);
      // The one that stayed has not moved.
      expect(symbolOf(doc, "v")).toBe(symbolOf(before, "v"));
    });
  });
});
