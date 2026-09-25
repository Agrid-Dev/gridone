import { describe, expect, it } from "vitest";
import type { Cell, PipeElement, SymbolElement } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { axisCentre } from "@/components/synoptic/runs";
import { nearestRide, rides } from "./snap";

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
const run = (id: string, from: Cell, to: Cell, waypoints: Cell[] = []) =>
  ({
    id,
    fluid: "dhw",
    from: { kind: "cell", cell: from },
    to: { kind: "cell", cell: to },
    waypoints,
    flow: null,
    tags: [],
  }) satisfies PipeElement;
const plate = (pipes: PipeElement[]): PlateDocument => ({
  version: 1,
  name: "p",
  description: null,
  projection: "isometric",
  symbols: [],
  pipes,
  labels: [],
});
const keys = (list: { cell: Cell }[]) =>
  list.map(({ cell }) => `${cell.x},${cell.y},${cell.z ?? 0}`);

describe("rides", () => {
  it("excludes other riders at the same height, retaining the moving rider's cell", () => {
    const doc = plate([
      run("a", at(0, 0), at(4, 0)),
      run("high", at(0, 0, 1), at(4, 0, 1)),
    ]);
    doc.symbols = [1, 2].map((x) => ({
      id: `v${x}`,
      type: "valve_check",
      placement: { kind: "pipe", pipe: "a", cell: at(x, 0) },
    }));
    expect(keys(rides(doc))).toEqual(["3,0,0", "1,0,1", "2,0,1", "3,0,1"]);
    expect(keys(rides(doc, "v1"))).toEqual([
      "1,0,0",
      "3,0,0",
      "1,0,1",
      "2,0,1",
      "3,0,1",
    ]);
  });
  it("offers the cells strictly inside a run, never its ends", () => {
    expect(keys(rides(plate([run("a", at(0, 0), at(3, 0))])))).toEqual([
      "1,0,0",
      "2,0,0",
    ]);
  });

  it("leaves out both ends of a riser", () => {
    // Along x at the floor, up at (2,0), along x overhead.
    const over = run("o", at(0, 0), at(4, 0, 1), [at(2, 0), at(2, 0, 1)]);
    expect(keys(rides(plate([over])))).toEqual(["1,0,0", "3,0,1"]);
  });

  it("follows the run's direction, the way out of the cell first", () => {
    const bent = run("b", at(0, 0), at(2, 2), [at(2, 0)]);
    const found = rides(plate([bent]));
    expect(found.map((r) => r.direction)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it("skips a run that is not drawable", () => {
    expect(rides(plate([run("d", at(0, 0), at(3, 3))]))).toEqual([]);
  });
});

describe("nearestRide", () => {
  const found = rides(plate([run("a", at(0, 0), at(5, 0))]));

  it("takes the nearest cell within the radius", () => {
    const near = axisCentre("flat", at(3, 0));
    expect(
      nearestRide(found, { x: near.x + 6, y: near.y + 4 }, 20)?.cell,
    ).toEqual(at(3, 0));
  });

  it("finds nothing past the radius", () => {
    const far = axisCentre("flat", at(3, 5));
    expect(nearestRide(found, far, 20)).toBeNull();
  });
});

describe("further cases, each pinned by a mutation", () => {
  const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
  const run = (
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
  const plate = (
    pipes: PipeElement[],
    symbols: SymbolElement[] = [],
  ): PlateDocument => ({
    version: 1,
    name: "p",
    description: null,
    projection: "isometric",
    symbols,
    pipes,
    labels: [],
  });
  const keys = (list: { pipe: string; cell: Cell }[]) =>
    list.map(({ pipe, cell }) => `${pipe}@${cell.x},${cell.y},${cell.z ?? 0}`);

  describe("rides", () => {
    it("offers nothing on a run whose end names a symbol the plate lacks, and still offers the others", () => {
      const lost: PipeElement = {
        ...run("lost", at(0, 0), at(4, 0)),
        from: { kind: "port", symbol: "ghost", port: "out" },
      };
      expect(keys(rides(plate([lost, run("ok", at(0, 3), at(2, 3))])))).toEqual(
        ["ok@1,3,0"],
      );
    });

    it("offers nothing on a run with a repeated corner", () => {
      expect(
        rides(plate([run("z", at(0, 0), at(4, 0), [at(2, 0), at(2, 0)])])),
      ).toEqual([]);
    });

    it("offers the cells between two ports, not the ports' own", () => {
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
        placement: { kind: "cell", cell: at(4, 0), rotation: 0 },
        props: {},
        bindings: {},
      };
      const feed: PipeElement = {
        ...run("feed", at(0, 0), at(4, 0)),
        from: { kind: "port", symbol: "t", port: "dhw_out" },
        to: { kind: "port", symbol: "e", port: "primary_in" },
      };
      expect(keys(rides(plate([feed], [tank, exchanger])))).toEqual([
        "feed@1,0,0",
        "feed@2,0,0",
        "feed@3,0,0",
      ]);
    });

    it("offers the overhead cells of a raised run between its risers", () => {
      const over = run("o", at(0, 0), at(6, 0), [
        at(1, 0),
        at(1, 0, 1),
        at(5, 0, 1),
        at(5, 0),
      ]);
      expect(keys(rides(plate([over])))).toEqual([
        "o@2,0,1",
        "o@3,0,1",
        "o@4,0,1",
      ]);
    });
  });

  describe("nearestRide", () => {
    const found = rides(
      plate([run("a", at(0, 0), at(6, 0)), run("b", at(0, 2), at(6, 2))]),
    );

    it("counts a point right at the radius as within it", () => {
      const centre = axisCentre("flat", at(3, 0));
      // Mutant: a strict comparison drops the edge of the snap circle.
      expect(
        nearestRide(found, { x: centre.x + 12, y: centre.y + 5 }, 13)?.cell,
      ).toEqual(at(3, 0));
      expect(
        nearestRide(found, { x: centre.x + 12, y: centre.y + 5 }, 12.99),
      ).toBeNull();
    });

    it("takes the nearer of two runs", () => {
      const between = axisCentre("flat", at(2, 1));
      const nearA = { x: between.x, y: between.y - 3 };
      const nearB = { x: between.x, y: between.y + 3 };
      expect(nearestRide(found, nearA, 40)?.pipe).toBe("a");
      expect(nearestRide(found, nearB, 40)?.pipe).toBe("b");
    });

    it("finds nothing among no candidates", () => {
      expect(nearestRide([], { x: 0, y: 0 }, 1000)).toBeNull();
    });
  });
});
