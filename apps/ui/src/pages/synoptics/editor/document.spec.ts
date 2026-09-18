import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Cell, PipeElement, Synoptic } from "@gridone/sdk";
import {
  emptyDocument,
  moveSymbol,
  nextId,
  removePipe,
  removeSymbol,
  rotateSymbol,
  routeWaypoints,
  toDocument,
} from "./document";
import type { PlateDocument } from "@/components/synoptic";

const PLATE: Synoptic = {
  ...JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../../../../docs/specs/synoptic/ecs-ouest.json",
      ),
      "utf8",
    ),
  ),
  id: "ouest",
  metadata: {
    created_at: "2026-09-17T12:00:00+00:00",
    updated_at: "2026-09-17T12:00:00+00:00",
  },
};

const pipe = (doc: PlateDocument, id: string): PipeElement =>
  doc.pipes!.find((p) => p.id === id)!;

describe("toDocument", () => {
  it("strips the envelope and nothing else, so the body is the export", () => {
    const doc = toDocument(PLATE);
    expect(doc).not.toHaveProperty("id");
    expect(doc).not.toHaveProperty("metadata");
    // Mutant: a document that drops labels or defaults would still save.
    expect(doc.labels).toHaveLength(5);
    expect(doc.defaults).toEqual(PLATE.defaults);
  });
});

describe("nextId", () => {
  it("takes the smallest number no symbol, pipe, tag or label uses", () => {
    const doc: PlateDocument = {
      ...emptyDocument("p"),
      symbols: [
        {
          id: "pump-1",
          type: "pump",
          placement: { kind: "cell", cell: { x: 0, y: 0 } },
        },
      ],
      pipes: [
        {
          id: "pump-2",
          fluid: "dhw",
          from: { kind: "cell", cell: { x: 0, y: 0 } },
          to: { kind: "cell", cell: { x: 1, y: 0 } },
          tags: [{ id: "pump-3", at: { x: 0, y: 0 }, label: "t" }],
        },
      ],
      labels: [{ id: "pump-4", at: { x: 0, y: 0 }, text: "t", role: "note" }],
    };
    // Mutant: a namespace of symbols alone would answer pump-2.
    expect(nextId(doc, "pump")).toBe("pump-5");
    expect(nextId(doc, "tank")).toBe("tank-1");
  });
});

describe("routeWaypoints", () => {
  const cell = (x: number, y: number, z = 0): Cell => ({ x, y, z });

  it("leaves a port through its face and enters the other through its face", () => {
    // A heat pump supply on +x at (1,1) feeding a tank primary_in on -x at (5,3):
    // the run must first step to (2,1) and arrive from (4,3).
    const waypoints = routeWaypoints([
      {
        endpoint: { kind: "port", symbol: "pac", port: "supply" },
        cell: cell(1, 1),
        side: "+x",
      },
      {
        endpoint: { kind: "port", symbol: "b", port: "primary_in" },
        cell: cell(5, 3),
        side: "-x",
      },
    ]);
    // Mutant: a dominant-axis-first route ignoring sides gives [(5,1)],
    // which the backend refuses as port_side_mismatch.
    expect(waypoints).toEqual([cell(4, 1), cell(4, 3)]);
  });

  it("climbs before travelling to a raised waypoint and descends after it", () => {
    // The overhead feed of the real plates, as an author clicks it: a free
    // start, one waypoint at level 1 over the row, the end at grade.
    const waypoints = routeWaypoints([
      { endpoint: { kind: "cell", cell: cell(6, -1) }, cell: cell(6, -1) },
      {
        endpoint: { kind: "cell", cell: cell(13, -1, 1) },
        cell: cell(13, -1, 1),
      },
      { endpoint: { kind: "cell", cell: cell(13, 0) }, cell: cell(13, 0) },
    ]);
    // Mutant: travelling at grade then climbing gives (13,-1,0) first.
    expect(waypoints).toEqual([
      cell(6, -1, 1),
      cell(13, -1, 1),
      cell(13, 0, 1),
    ]);
  });

  it("turns after the longer plan axis", () => {
    // Mutant: always x first turns at (1,0) and runs the long way last.
    expect(
      routeWaypoints([
        { endpoint: { kind: "cell", cell: cell(0, 0) }, cell: cell(0, 0) },
        { endpoint: { kind: "cell", cell: cell(1, 5) }, cell: cell(1, 5) },
      ]),
    ).toEqual([cell(0, 5)]);
  });

  it("never doubles back through the body a port belongs to", () => {
    // A heat pump whose supply leaves +x at (1,5), feeding a tank inlet on
    // the -x face of (2,1): the inlet's approach cell (1,1) lies back
    // toward the pump, so both single-bend orders would run through the
    // tank or reverse out of the pump. The run goes up halfway, across,
    // then up into the inlet, and every cell is visited once.
    const waypoints = routeWaypoints([
      {
        endpoint: { kind: "port", symbol: "pac", port: "supply" },
        cell: cell(1, 5),
        side: "+x",
      },
      {
        endpoint: { kind: "port", symbol: "b", port: "primary_in" },
        cell: cell(2, 1),
        side: "-x",
      },
    ]);
    expect(waypoints).toEqual([cell(2, 5), cell(2, 3), cell(1, 3), cell(1, 1)]);
    const visited = [cell(1, 5), ...waypoints, cell(2, 1)].map(
      (c) => `${c.x},${c.y}`,
    );
    expect(new Set(visited).size).toBe(visited.length);
  });

  it("keeps a corner where a run turns back on itself", () => {
    // Mutant: a collinearity test on shared coordinates alone drops (0,3)
    // and the run collapses to nothing.
    expect(
      routeWaypoints([
        { endpoint: { kind: "cell", cell: cell(0, 0) }, cell: cell(0, 0) },
        { endpoint: { kind: "cell", cell: cell(0, 3) }, cell: cell(0, 3) },
        { endpoint: { kind: "cell", cell: cell(0, 1) }, cell: cell(0, 1) },
      ]),
    ).toEqual([cell(0, 3)]);
  });

  it("joins two facing ports in adjacent cells directly", () => {
    // Each port's step out lands in the other's cell; the run must not
    // go out and straight back. Mutant: keeping the spike stores an
    // A-B-A-B zigzag the backend accepts and the renderer draws doubled.
    expect(
      routeWaypoints([
        {
          endpoint: { kind: "port", symbol: "a", port: "out" },
          cell: cell(0, 0),
          side: "+x",
        },
        {
          endpoint: { kind: "port", symbol: "b", port: "in" },
          cell: cell(1, 0),
          side: "-x",
        },
      ]),
    ).toEqual([]);
  });

  it("steps aside rather than run back through the body on a straight line", () => {
    // pac-01's supply leaves +x from (1,1); the author clicks (-2,1) on the
    // same row, behind the pump. Mutant: a plain straight run crosses the
    // pump's own cells (1,1) and (0,1) and the plate draws a pipe through it.
    const waypoints = routeWaypoints([
      {
        endpoint: { kind: "port", symbol: "pac", port: "supply" },
        cell: cell(1, 1),
        side: "+x",
      },
      { endpoint: { kind: "cell", cell: cell(-2, 1) }, cell: cell(-2, 1) },
    ]);
    expect(waypoints).toEqual([cell(2, 1), cell(2, 2), cell(-2, 2)]);
  });

  it("drops corners a straight run does not need", () => {
    expect(
      routeWaypoints([
        { endpoint: { kind: "cell", cell: cell(0, 0) }, cell: cell(0, 0) },
        { endpoint: { kind: "cell", cell: cell(3, 0) }, cell: cell(3, 0) },
      ]),
    ).toEqual([]);
  });
});

describe("removeSymbol", () => {
  it("keeps the runs on its ports as free cells", () => {
    const doc = removeSymbol(toDocument(PLATE), "pac-01");
    expect(doc.symbols!.some((s) => s.id === "pac-01")).toBe(false);
    const supply = pipe(doc, "pac-01-supply");
    // Mutant: dropping the run with the symbol leaves the tank unfed.
    expect(supply.from).toEqual({ kind: "cell", cell: { x: 1, y: 1, z: 0 } });
    expect(supply.to.kind).toBe("port");
  });
});

describe("removePipe", () => {
  it("removes the symbols riding it and frees the tees off it", () => {
    const before = toDocument(PLATE);
    const trunk = before.pipes!.find((p) =>
      before.pipes!.some((q) => q.from.kind === "pipe" && q.from.pipe === p.id),
    )!;
    const branch = before.pipes!.find(
      (q) => q.from.kind === "pipe" && q.from.pipe === trunk.id,
    )!;
    const riders = before.symbols!.filter(
      (s) => s.placement.kind === "pipe" && s.placement.pipe === trunk.id,
    );
    const doc = removePipe(before, trunk.id);
    expect(doc.pipes!.some((p) => p.id === trunk.id)).toBe(false);
    expect(doc.symbols!.filter((s) => riders.includes(s))).toHaveLength(0);
    const teeCell = (branch.from as { cell: Cell }).cell;
    expect(pipe(doc, branch.id).from).toEqual({ kind: "cell", cell: teeCell });
  });
});

describe("moveSymbol", () => {
  it("moves the origin and leaves every waypoint where it was", () => {
    const before = toDocument(PLATE);
    const doc = moveSymbol(before, "pac-01", { x: 0, y: 1, z: 0 });
    expect(doc.symbols![0].placement.cell).toEqual({ x: 0, y: 1, z: 0 });
    expect(pipe(doc, "pac-01-supply").waypoints).toEqual(
      pipe(before, "pac-01-supply").waypoints,
    );
  });

  it("does not move an inline symbol off its run", () => {
    const before = toDocument(PLATE);
    const inline = before.symbols!.find((s) => s.placement.kind === "pipe")!;
    expect(moveSymbol(before, inline.id, { x: 99, y: 99 })).toEqual(before);
  });
});

describe("rotateSymbol", () => {
  it("turns a free symbol a quarter and leaves a rotation-locked type alone", () => {
    const before = toDocument(PLATE);
    const turned = rotateSymbol(before, "pac-01");
    expect(turned.symbols![0].placement).toMatchObject({ rotation: 1 });
    const collector = before.symbols!.find((s) => s.type === "collector")!;
    // Mutant: rotating the collector is refused at save as rotation_locked.
    expect(rotateSymbol(before, collector.id)).toEqual(before);
  });
});
