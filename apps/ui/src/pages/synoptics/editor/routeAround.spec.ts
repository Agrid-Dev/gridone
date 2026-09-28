import { describe, expect, it } from "vitest";
import type { Cell } from "@gridone/sdk";
import { runCells } from "@/components/synoptic/runs";
import { routeWaypoints, type RoutePoint } from "./document";
import { routeAround } from "./routeAround";
import { cellKey, segmentRule } from "./runRules";

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });

/** A port at `cell` whose face points along `side`. */
const port = (cell: Cell, side: RoutePoint["side"]): RoutePoint => ({
  endpoint: { kind: "port", symbol: "s", port: "p" },
  cell,
  side,
});

// A run from a port at (0,0) facing +x to one at (8,0) facing -x: the
// router's path is the straight line between them.
const A = port(at(0, 0), "+x");
const B = port(at(8, 0), "-x");

const keys = (cells: Cell[]) => new Set(cells.map(cellKey));
/** Every cell the run passes, from `A` to `B`. */
const cellsOf = (waypoints: Cell[]) =>
  runCells([A.cell, ...waypoints, B.cell]).map(cellKey);
const bends = (waypoints: Cell[]) => waypoints.length;

describe("routeAround", () => {
  it("keeps the router's own path when nothing stands on it", () => {
    const blocked = keys([at(4, 3), at(20, 20)]);
    expect(routeAround([A, B], blocked, true)).toEqual(routeWaypoints([A, B]));
  });

  it("goes round a body on the floor with as few bends as it takes", () => {
    const blocked = keys([at(4, 0)]);
    const route = routeAround([A, B], blocked, true)!;
    expect(route).not.toBeNull();
    const cells = cellsOf(route);
    expect(cells).not.toContain(cellKey(at(4, 0)));
    // Aside, along, back, and on: four bends, on the floor.
    expect(bends(route)).toBe(4);
    expect(route.every((c) => (c.z ?? 0) === 0)).toBe(true);
    // Every segment straight, as the backend wants it.
    const corners = [A.cell, ...route, B.cell];
    for (let i = 1; i < corners.length; i++) {
      expect(segmentRule(corners[i - 1], corners[i])).toBeNull();
    }
  });

  it("hops over a bar the floor offers no way round, as an author does over a collector", () => {
    // A wall across the whole reach on the floor, between the two ports.
    const wall = Array.from({ length: 61 }, (_, i) => at(4, i - 30));
    const route = routeAround([A, B], keys(wall), true)!;
    expect(route).not.toBeNull();
    expect(route.some((c) => c.z === 1)).toBe(true);
    // Over the wall, never through it.
    const cells = cellsOf(route);
    expect(cells).toContain(cellKey(at(4, 0, 1)));
    expect(cells).not.toContain(cellKey(at(4, 0)));
  });

  it("never climbs where the plate allows no height", () => {
    const wall = Array.from({ length: 61 }, (_, i) => at(4, i - 30));
    expect(routeAround([A, B], keys(wall), false)).toBeNull();
    // With a gap in the wall, it goes through the gap on the floor.
    const gapped = wall.filter((c) => c.y !== 5);
    const route = routeAround([A, B], keys(gapped), false)!;
    expect(route).not.toBeNull();
    expect(cellsOf(route)).toContain(cellKey(at(4, 5)));
    expect(route.every((c) => (c.z ?? 0) === 0)).toBe(true);
  });

  it("finds no way out of a port whose face another body covers", () => {
    expect(routeAround([A, B], keys([at(1, 0)]), true)).toBeNull();
    expect(routeAround([A, B], keys([at(7, 0)]), true)).toBeNull();
  });

  it("comes back past its own start without passing a cell twice", () => {
    // Out of (0,0) along +x, into a port at (0,2) that faces +x too, with
    // the straight way down barred: the run goes round and comes back
    // alongside itself, never over itself.
    const back = port(at(0, 2), "+x");
    const route = routeAround([A, back], keys([at(1, 1)]), true)!;
    expect(route).not.toBeNull();
    const cells = runCells([A.cell, ...route, back.cell]).map(cellKey);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).not.toContain(cellKey(at(1, 1)));
  });

  it("routes each leg through the points between, none crossing a leg before it", () => {
    const pin: RoutePoint = {
      endpoint: { kind: "cell", cell: at(4, 3) },
      cell: at(4, 3),
    };
    const route = routeAround([A, pin, B], keys([at(4, 1), at(4, 2)]), true)!;
    expect(route).not.toBeNull();
    const cells = cellsOf(route);
    expect(cells).toContain(cellKey(at(4, 3)));
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).not.toContain(cellKey(at(4, 1)));
  });
});
