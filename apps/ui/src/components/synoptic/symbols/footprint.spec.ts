import type { Cell, SymbolElement } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import {
  collectorShape,
  footprintCells,
  footprintRect,
  footprintSize,
  symbolRotation,
} from "./footprint";

const at = (
  type: string,
  cell: Cell,
  rotation?: number,
  props?: SymbolElement["props"],
): SymbolElement => ({
  id: type,
  type,
  placement: { kind: "cell", cell, rotation },
  props,
});

const BAR = { axis: "y" as const, length: 3, ports: {} };

describe("collectorShape", () => {
  it("is the authored bar of a collector, and null for anything else", () => {
    const bar = at("collector", { x: 0, y: 0 }, 0, BAR);
    expect(collectorShape(bar)).toBe(BAR);
    expect(collectorShape(at("tank", { x: 0, y: 0 }))).toBeNull();
  });

  it("is null for a collector whose props do not describe a bar", () => {
    expect(collectorShape(at("collector", { x: 0, y: 0 }))).toBeNull();
    expect(
      collectorShape(at("collector", { x: 0, y: 0 }, 0, { axis: "x" })),
    ).toBeNull();
    expect(
      collectorShape(at("collector", { x: 0, y: 0 }, 0, { length: 3 })),
    ).toBeNull();
  });
});

describe("footprintSize", () => {
  it.each([
    ["heat_pump", { w: 2, d: 2 }],
    ["tank", { w: 1, d: 2 }],
    ["link", { w: 1, d: 2 }],
    ["pump", { w: 1, d: 1 }],
    ["reactor", { w: 1, d: 1 }],
  ])(
    "reads %s off the registry, one cell for a type it lacks",
    (type, size) => {
      expect(footprintSize(at(type, { x: 0, y: 0 }))).toEqual(size);
    },
  );

  it("stretches a collector along its axis by its length, one cell without a bar", () => {
    expect(
      footprintSize(
        at("collector", { x: 0, y: 0 }, 0, { ...BAR, axis: "x", length: 5 }),
      ),
    ).toEqual({ w: 5, d: 1 });
    expect(
      footprintSize(at("collector", { x: 0, y: 0 }, 0, { ...BAR, length: 5 })),
    ).toEqual({ w: 1, d: 5 });
    expect(
      footprintSize(at("collector", { x: 0, y: 0 }, 0, { axis: "x" })),
    ).toEqual({ w: 1, d: 1 });
  });
});

describe("symbolRotation", () => {
  it("is the cell placement's turn, none by default, and none on a run", () => {
    expect(symbolRotation(at("tank", { x: 0, y: 0 }, 3))).toBe(3);
    expect(symbolRotation(at("tank", { x: 0, y: 0 }))).toBe(0);
    expect(
      symbolRotation({
        id: "p",
        type: "pump",
        placement: { kind: "pipe", pipe: "run", cell: { x: 0, y: 0 } },
      }),
    ).toBe(0);
  });
});

describe("footprintCells", () => {
  it("turns a tank's second cell counter-clockwise about its origin, carrying its height", () => {
    const origin = { x: 2, y: 3, z: 1 };
    expect(footprintCells(at("tank", origin, 0))).toEqual([
      { x: 2, y: 3, z: 1 },
      { x: 2, y: 4, z: 1 },
    ]);
    expect(footprintCells(at("tank", origin, 1))).toEqual([
      { x: 2, y: 3, z: 1 },
      { x: 1, y: 3, z: 1 },
    ]);
    expect(footprintCells(at("tank", origin, 2))).toEqual([
      { x: 2, y: 3, z: 1 },
      { x: 2, y: 2, z: 1 },
    ]);
    expect(footprintCells(at("tank", origin, 3))).toEqual([
      { x: 2, y: 3, z: 1 },
      { x: 3, y: 3, z: 1 },
    ]);
  });

  it("lays a turned 2 x 2 body over x in [-1, 1), where its ports go", () => {
    expect(footprintCells(at("heat_pump", { x: 0, y: 0 }, 1))).toEqual([
      { x: 0, y: 0, z: undefined },
      { x: -1, y: 0, z: undefined },
      { x: 0, y: 1, z: undefined },
      { x: -1, y: 1, z: undefined },
    ]);
  });

  it("walks a collector's bar along its axis", () => {
    expect(
      footprintCells(at("collector", { x: 5, y: 5 }, 0, BAR)).map((c) => [
        c.x,
        c.y,
      ]),
    ).toEqual([
      [5, 5],
      [5, 6],
      [5, 7],
    ]);
  });
});

describe("footprintRect", () => {
  it("frames the turned footprint, far edges exclusive", () => {
    expect(footprintRect(at("heat_pump", { x: 0, y: 0 }, 1))).toEqual({
      x0: -1,
      y0: 0,
      x1: 1,
      y1: 2,
    });
    expect(footprintRect(at("tank", { x: 2, y: 3 }, 3))).toEqual({
      x0: 2,
      y0: 3,
      x1: 4,
      y1: 4,
    });
    expect(
      footprintRect(
        at("collector", { x: 1, y: 1 }, 0, { ...BAR, axis: "x", length: 4 }),
      ),
    ).toEqual({ x0: 1, y0: 1, x1: 5, y1: 2 });
  });

  it("degrades a collector without a bar to its one cell", () => {
    expect(
      footprintRect(at("collector", { x: 1, y: 1 }, 0, { axis: "x" })),
    ).toEqual({ x0: 1, y0: 1, x1: 2, y1: 2 });
  });
});
