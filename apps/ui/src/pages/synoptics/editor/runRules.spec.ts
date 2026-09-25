import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Cell, PipeElement, SymbolElement } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import {
  depthsOf,
  direction,
  runViolations,
  segmentRule,
  type RunViolation,
  cellsOf,
} from "./runRules";

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

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });

// A tank (dhw_out on +x at its origin) feeding a plate exchanger
// (primary_in on -x) five cells to its right, in a straight line.
const tank: SymbolElement = {
  id: "t",
  type: "tank",
  placement: { kind: "cell", cell: at(0, 0), rotation: 0 },
  props: { capacity: "" },
  bindings: {},
};
const exchanger: SymbolElement = {
  id: "e",
  type: "plate_exchanger",
  placement: { kind: "cell", cell: at(5, 0), rotation: 0 },
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
const free = (id: string, from: Cell, to: Cell, waypoints: Cell[] = []) =>
  ({
    id,
    fluid: "dhw",
    from: { kind: "cell", cell: from },
    to: { kind: "cell", cell: to },
    waypoints,
    flow: null,
    tags: [],
  }) satisfies PipeElement;

const plate = (
  pipes: PipeElement[] = [feed],
  symbols: SymbolElement[] = [],
): PlateDocument => ({
  version: 1,
  name: "p",
  description: null,
  projection: "isometric",
  symbols: [tank, exchanger, ...symbols],
  pipes,
  labels: [],
});

const rules = (doc: PlateDocument, only?: ReadonlySet<string>) =>
  runViolations(doc, only).map((v: RunViolation) => `${v.element}:${v.rule}`);

describe("direction and segmentRule", () => {
  it("names the face an axis-aligned segment leaves through", () => {
    expect(direction(at(0, 0), at(3, 0))).toBe("+x");
    expect(direction(at(0, 0), at(0, -2))).toBe("-y");
    expect(direction(at(0, 0, 0), at(0, 0, 1))).toBe("+z");
    expect(direction(at(0, 0), at(1, 1))).toBeUndefined();
  });

  it("tells a repeated corner from a diagonal", () => {
    expect(segmentRule(at(1, 1), at(1, 1))).toBe("zero_length_segment");
    expect(segmentRule(at(1, 1), at(2, 2))).toBe("diagonal_segment");
    expect(segmentRule(at(1, 1, 0), at(1, 1, 1))).toBeNull();
    // A missing z reads as 0, as the backend's default does.
    expect(segmentRule({ x: 1, y: 1 }, at(1, 1, 0))).toBe(
      "zero_length_segment",
    );
  });
});

describe("runViolations", () => {
  it.each(["ecs-est", "ecs-ouest", "production-chaud", "production-froid"])(
    "finds nothing on the committed plate %s, which the backend takes",
    (name) => {
      expect(runViolations(load(name))).toEqual([]);
    },
  );

  it("finds nothing on a straight run between two facing ports", () => {
    expect(rules(plate())).toEqual([]);
  });

  it("files a repeated waypoint and a diagonal under the run", () => {
    expect(
      rules(plate([{ ...feed, waypoints: [at(3, 0), at(3, 0)] }])),
    ).toEqual(["feed:zero_length_segment"]);
    expect(rules(plate([free("d", at(10, 10), at(12, 12))]))).toEqual([
      "d:diagonal_segment",
    ]);
  });

  it("refuses a run leaving or entering a port against its face", () => {
    // Leaves the tank's +x face going down, and reaches the exchanger's
    // -x face from below.
    const bent = { ...feed, waypoints: [at(0, 2), at(5, 2)] };
    expect(rules(plate([bent]))).toEqual([
      "feed:port_side_mismatch",
      "feed:port_side_mismatch",
    ]);
  });

  it("names an end on a symbol or a port the plate lacks", () => {
    expect(
      rules(
        plate([{ ...feed, to: { kind: "port", symbol: "ghost", port: "in" } }]),
      ),
    ).toEqual(["feed:unknown_symbol"]);
    expect(
      rules(plate([{ ...feed, to: { kind: "port", symbol: "e", port: "x" } }])),
    ).toEqual(["feed:unknown_port"]);
  });

  it("files a tag off its run under the run", () => {
    const tagged = {
      ...feed,
      tags: [
        { id: "on", at: at(3, 0), label: "on" },
        { id: "off", at: at(3, 1), label: "off" },
      ],
    };
    expect(rules(plate([tagged]))).toEqual(["feed:off_polyline"]);
  });

  it("checks a tee against the cells of its trunk", () => {
    const tee = (cell: Cell, pipe = "feed"): PipeElement => ({
      ...free("branch", cell, at(cell.x, 4)),
      from: { kind: "pipe", pipe, cell },
    });
    expect(rules(plate([feed, tee(at(2, 0))]))).toEqual([]);
    expect(rules(plate([feed, tee(at(2, 1))]))).toEqual([
      "branch:off_polyline",
    ]);
    expect(rules(plate([feed, tee(at(2, 0), "branch")]))).toEqual([
      "branch:self_reference",
    ]);
    expect(rules(plate([feed, tee(at(2, 0), "nowhere")]))).toEqual([
      "branch:unknown_pipe",
    ]);
    // A trunk that does not itself validate carries no tee: the branch is
    // told so, rather than being told its cell is off a run nobody drew.
    // One diagonal per bad segment, as the backend counts them.
    const broken = { ...feed, waypoints: [at(3, 3)] };
    expect(rules(plate([broken, tee(at(2, 0))]))).toEqual([
      "feed:diagonal_segment",
      "feed:diagonal_segment",
      "branch:unusable_pipe",
    ]);
  });

  it("places an inline symbol strictly inside a run of an inline type", () => {
    const rider = (type: string, cell: Cell, pipe = "feed"): SymbolElement => ({
      id: "r",
      type,
      placement: { kind: "pipe", pipe, cell },
      props: {},
      bindings: {},
    });
    expect(rules(plate([feed], [rider("pump", at(3, 0))]))).toEqual([]);
    expect(rules(plate([feed], [rider("pump", at(3, 1))]))).toEqual([
      "r:off_polyline",
    ]);
    // The run's first cell is the tank's own: a pump there has no pipe.
    expect(rules(plate([feed], [rider("pump", at(0, 0))]))).toEqual([
      "r:inline_on_endpoint",
    ]);
    expect(rules(plate([feed], [rider("tank", at(3, 0))]))).toEqual([
      "r:not_inline_capable",
    ]);
    expect(rules(plate([feed], [rider("pump", at(3, 0), "gone")]))).toEqual([
      "r:unknown_pipe",
    ]);
  });

  it("refuses any depth on a flat plate, and only there", () => {
    const raised = free("over", at(0, 5), at(4, 5), [at(0, 5, 1), at(4, 5, 1)]);
    const iso = plate([feed, raised]);
    expect(rules(iso)).toEqual([]);
    expect(rules({ ...iso, projection: "flat" })).toEqual([
      "over:flat_depth",
      "over:flat_depth",
    ]);
  });

  it("limits the check to what hangs on the runs it is given", () => {
    const branch: PipeElement = {
      ...free("branch", at(2, 1), at(2, 4)),
      from: { kind: "pipe", pipe: "feed", cell: at(2, 1) },
    };
    const other = free("other", at(10, 10), at(12, 12));
    const doc = plate([feed, branch, other]);
    expect(rules(doc)).toEqual([
      "other:diagonal_segment",
      "branch:off_polyline",
    ]);
    // Asking about `feed` reports the tee onto it, not the unrelated
    // diagonal; asking about `other` reports its own fault only.
    expect(rules(doc, new Set(["feed"]))).toEqual(["branch:off_polyline"]);
    expect(rules(doc, new Set(["other"]))).toEqual(["other:diagonal_segment"]);
  });
});

describe("depthsOf", () => {
  it("lists every depth the backend checks on a flat plate", () => {
    const raised = {
      ...free("p", at(0, 5, 1), at(4, 5), [at(4, 5, 1)]),
      tags: [{ id: "tg", at: at(2, 5, 1), label: "T" }],
    };
    const doc: PlateDocument = {
      ...plate([raised]),
      labels: [{ id: "l", at: { x: 1, y: 1, z: 2 }, text: "", role: "note" }],
    };
    expect(depthsOf(doc).filter((d) => d.z)).toEqual([
      { element: "p", z: 1 },
      { element: "p", z: 1 },
      { element: "p", z: 1 },
      { element: "l", z: 2 },
    ]);
  });
});

describe("further cases, each pinned by a mutation", () => {
  const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });

  // A tank (dhw_out on +x at its origin) feeding a plate exchanger
  // (primary_in on -x) five cells to its right, in a straight line.
  const tank: SymbolElement = {
    id: "t",
    type: "tank",
    placement: { kind: "cell", cell: at(0, 0), rotation: 0 },
    props: { capacity: "" },
    bindings: {},
  };
  const exchanger: SymbolElement = {
    id: "e",
    type: "plate_exchanger",
    placement: { kind: "cell", cell: at(5, 0), rotation: 0 },
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
  const free = (
    id: string,
    from: Cell,
    to: Cell,
    waypoints: Cell[] = [],
  ): PipeElement => ({
    id,
    fluid: "dhw",
    from: { kind: "cell", cell: from },
    to: { kind: "cell", cell: to },
    waypoints,
    flow: null,
    tags: [],
  });
  const tee = (
    id: string,
    trunk: string,
    cell: Cell,
    end: Cell,
  ): PipeElement => ({
    ...free(id, cell, end),
    from: { kind: "pipe", pipe: trunk, cell },
  });
  const rider = (
    id: string,
    pipe: string,
    cell: Cell,
    type = "pump",
  ): SymbolElement => ({
    id,
    type,
    placement: { kind: "pipe", pipe, cell },
    props: {},
    bindings: {},
  });
  const plate = (
    pipes: PipeElement[],
    symbols: SymbolElement[] = [],
    projection: PlateDocument["projection"] = "isometric",
  ): PlateDocument => ({
    version: 1,
    name: "p",
    description: null,
    projection,
    symbols: [tank, exchanger, ...symbols],
    pipes,
    labels: [],
  });
  const rules = (doc: PlateDocument, only?: string[]) =>
    runViolations(doc, only && new Set(only)).map(
      (v) => `${v.element}:${v.rule}`,
    );

  describe("runViolations, limited to some runs", () => {
    // `broken` is diagonal; `branch` tees onto `feed` off its cells; `on`
    // tees onto `broken`; `r` rides `broken`.
    const doc = plate(
      [
        feed,
        free("broken", at(10, 10), at(12, 12)),
        tee("branch", "feed", at(2, 1), at(2, 4)),
        tee("on", "broken", at(10, 10), at(10, 14)),
      ],
      [rider("r", "broken", at(11, 10))],
    );

    it("reports a tee from a run outside the set onto one inside it", () => {
      // Mutant: checking a tee only when its own run is asked about misses
      // the branch a re-route of `feed` stranded.
      expect(rules(doc, ["feed"])).toEqual(["branch:off_polyline"]);
    });

    it("tells a branch its trunk is unusable without reporting the trunk's own fault", () => {
      // Mutant: filing the trunk's faults while resolving it for the tee adds
      // broken:diagonal_segment here.
      expect(rules(doc, ["on"])).toEqual(["on:unusable_pipe"]);
    });

    it("reports a rider only through the run it rides", () => {
      expect(rules(doc, ["feed"])).not.toContain("r:unusable_pipe");
      expect(rules(doc, ["broken"])).toEqual([
        "broken:diagonal_segment",
        "on:unusable_pipe",
        "r:unusable_pipe",
      ]);
    });

    it("reports a flat plate's depths for the runs asked about only", () => {
      const flat = plate(
        [
          free("low", at(0, 5), at(4, 5)),
          free("high", at(0, 8), at(4, 8), [at(0, 8, 1), at(4, 8, 1)]),
        ],
        [],
        "flat",
      );
      expect(rules(flat, ["low"])).toEqual([]);
      // Mutant: a depth reported whatever the set files `high` under `low`'s
      // question.
      expect(rules(flat, ["high"])).toEqual([
        "high:flat_depth",
        "high:flat_depth",
      ]);
    });
  });

  describe("runViolations on inline symbols", () => {
    it("refuses an inline symbol on the far end of its run as on the near one", () => {
      // Mutant: an interior that keeps the last cell lets a pump sit on the
      // exchanger's own port cell.
      expect(rules(plate([feed], [rider("p", "feed", at(5, 0))]))).toEqual([
        "p:inline_on_endpoint",
      ]);
    });

    it("counts a run's first cell as inside when the run passes it again", () => {
      // Out along x, round, back up through (0,5) and on to (-2,5): (0,5) is
      // the first cell and the seventh. The backend judges by position, so a
      // pump on it is inside the run.
      const loop = free("loop", at(0, 5), at(-2, 5), [
        at(2, 5),
        at(2, 6),
        at(0, 6),
        at(0, 4),
        at(-2, 4),
      ]);
      expect(rules(plate([loop], [rider("p", "loop", at(0, 5))]))).toEqual([]);
      expect(
        cellsOf([at(0, 5), at(2, 5), at(2, 6), at(0, 6), at(0, 4)]).interior,
      ).toContain("0,5,0");
    });

    it("does not call an unknown type unfit for a pipe, as the backend leaves that to its type check", () => {
      // Mutant: reading a missing schema as "not inline" files a second,
      // misleading violation on a symbol the save already names.
      expect(
        rules(plate([feed], [rider("p", "feed", at(2, 0), "no_such_type")])),
      ).toEqual([]);
    });

    it("files a run on a symbol of an unknown type as an unknown port", () => {
      const ghost: SymbolElement = {
        ...exchanger,
        id: "g",
        type: "no_such_type",
        placement: { kind: "cell", cell: at(8, 0), rotation: 0 },
      };
      const run = { ...feed, to: { kind: "port", symbol: "g", port: "in" } };
      expect(rules(plate([run as PipeElement], [ghost]))).toEqual([
        "feed:unknown_port",
      ]);
    });
  });

  describe("runViolations on port faces", () => {
    it("names each end that leaves or enters against its face", () => {
      // Enters the exchanger from below; leaves the tank the right way.
      const late = { ...feed, waypoints: [at(3, 0), at(3, 2), at(5, 2)] };
      expect(rules(plate([late]))).toEqual(["feed:port_side_mismatch"]);
    });

    it("does not judge the tags of a run whose segments are broken", () => {
      const run = {
        ...free("d", at(10, 10), at(12, 12)),
        tags: [{ id: "tg", at: at(0, 30), label: "T" }],
      };
      expect(rules(plate([run]))).toEqual(["d:diagonal_segment"]);
    });

    it("takes a tee onto either end cell of its trunk", () => {
      expect(
        rules(
          plate([
            feed,
            tee("a", "feed", at(0, 0), at(0, -3)),
            tee("b", "feed", at(5, 0), at(5, -3)),
          ]),
        ),
      ).toEqual([]);
    });
  });
});
