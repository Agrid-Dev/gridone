import type { PipeElement, SymbolElement } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import { endpointCell, pieceAt, runCells, runPieces } from "./runs";

const symbol = (
  id: string,
  type: string,
  cell: { x: number; y: number; z?: number },
  extra: Partial<SymbolElement> = {},
): SymbolElement => ({
  id,
  type,
  placement: { kind: "cell", cell, rotation: 0 },
  ...extra,
});

const SYMBOLS = new Map(
  [
    symbol("pac", "heat_pump", { x: 0, y: 0 }),
    symbol("b01", "tank", { x: 4, y: 0 }),
    symbol(
      "turned",
      "tank",
      { x: 4, y: 4 },
      {
        placement: { kind: "cell", cell: { x: 4, y: 4 }, rotation: 1 },
      },
    ),
    symbol(
      "col",
      "collector",
      { x: 6, y: 0 },
      {
        props: {
          axis: "y",
          length: 3,
          ports: { in_1: { offset: 2, side: "-x" } },
        },
      },
    ),
    symbol("mystery", "not_a_type", { x: 9, y: 9 }),
  ].map((s) => [s.id, s]),
);

const pipe = (
  from: PipeElement["from"],
  to: PipeElement["to"],
  waypoints: PipeElement["waypoints"] = [],
): PipeElement => ({ id: "p", fluid: "dhw", from, to, waypoints });

describe("endpointCell", () => {
  it("lands a port endpoint on the port's cell, rotation applied", () => {
    expect(
      endpointCell({ kind: "port", symbol: "pac", port: "supply" }, SYMBOLS),
    ).toEqual({ x: 1, y: 1, z: 0 });
    // primary_out is (0, 1) on the type; one quarter turn puts it at (-1, 0).
    expect(
      endpointCell(
        { kind: "port", symbol: "turned", port: "primary_out" },
        SYMBOLS,
      ),
    ).toEqual({ x: 3, y: 4, z: 0 });
  });

  it("reads a collector's ports off its props", () => {
    expect(
      endpointCell({ kind: "port", symbol: "col", port: "in_1" }, SYMBOLS),
    ).toEqual({ x: 6, y: 2, z: 0 });
  });

  it("uses the cell of a free or tee endpoint as is", () => {
    const cell = { x: 2, y: 3, z: 1 };
    expect(endpointCell({ kind: "cell", cell }, SYMBOLS)).toBe(cell);
    expect(endpointCell({ kind: "pipe", pipe: "x", cell }, SYMBOLS)).toBe(cell);
  });

  it("degrades to the symbol's cell on an unknown type or port", () => {
    expect(
      endpointCell({ kind: "port", symbol: "mystery", port: "in" }, SYMBOLS),
    ).toEqual({ x: 9, y: 9 });
    expect(
      endpointCell({ kind: "port", symbol: "pac", port: "nope" }, SYMBOLS),
    ).toEqual({ x: 0, y: 0 });
  });

  it("degrades to the origin on a symbol the plate does not have", () => {
    expect(
      endpointCell({ kind: "port", symbol: "ghost", port: "in" }, SYMBOLS),
    ).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("runCells", () => {
  it("expands a straight segment cell by cell, both ends included", () => {
    expect(
      runCells([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ]).map((c) => c.x),
    ).toEqual([0, 1, 2, 3]);
  });

  it("counts a corner once and walks backwards and up", () => {
    expect(
      runCells([
        { x: 1, y: 1 },
        { x: 0, y: 1 },
        { x: 0, y: 1, z: 2 },
      ]),
    ).toEqual([
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 1 },
      { x: 0, y: 1, z: 2 },
    ]);
  });

  it("is one cell for a point, and ignores a repeated point", () => {
    expect(runCells([{ x: 5, y: 5 }])).toEqual([{ x: 5, y: 5, z: 0 }]);
    expect(
      runCells([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]),
    ).toHaveLength(1);
  });
});

describe("runPieces", () => {
  const cellA = { kind: "cell", cell: { x: 0, y: 0 } } as const;
  const cellB = { kind: "cell", cell: { x: 1, y: 0 } } as const;

  it("gives each cell its half-segments in and out, meeting at its centre", () => {
    const pieces = runPieces("flat", pipe(cellA, cellB), SYMBOLS);
    expect(pieces.map((p) => p.points)).toEqual([
      [
        { x: 24, y: 24 },
        { x: 24, y: 24 },
        { x: 48, y: 24 },
      ],
      [
        { x: 48, y: 24 },
        { x: 72, y: 24 },
        { x: 72, y: 24 },
      ],
    ]);
    expect(pieces.map((p) => p.direction)).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it("starts and ends a port run at the port faces", () => {
    const pieces = runPieces(
      "flat",
      pipe(
        { kind: "port", symbol: "pac", port: "supply" },
        { kind: "port", symbol: "b01", port: "primary_in" },
        [{ x: 4, y: 1 }],
      ),
      SYMBOLS,
    );
    // supply leaves (1, 1) through +x: the face centre is x = 96.
    expect(pieces[0].points[0]).toEqual({ x: 96, y: 72 });
    // primary_in enters (4, 0) through -x: the face centre is x = 192.
    expect(pieces[pieces.length - 1].points[2]).toEqual({ x: 192, y: 24 });
    expect(pieces.map((p) => p.cell)).toEqual([
      { x: 1, y: 1, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 3, y: 1, z: 0 },
      { x: 4, y: 1, z: 0 },
      { x: 4, y: 0, z: 0 },
    ]);
  });

  it("turns the direction at a bend to the way the run leaves", () => {
    const pieces = runPieces(
      "flat",
      pipe(cellA, { kind: "cell", cell: { x: 1, y: 2 } }, [{ x: 1, y: 0 }]),
      SYMBOLS,
    );
    expect(pieces.map((p) => p.direction)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ]);
    // The bend cell holds its corner.
    expect(pieces[1].points).toEqual([
      { x: 48, y: 24 },
      { x: 72, y: 24 },
      { x: 72, y: 48 },
    ]);
  });

  it("gives a vertical cell the plan direction of the run it belongs to", () => {
    const pieces = runPieces(
      "isometric",
      pipe(cellA, { kind: "cell", cell: { x: 0, y: 0, z: 1 } }),
      SYMBOLS,
    );
    expect(pieces.map((p) => p.direction)).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it("is a single piece for a run that starts where it ends", () => {
    const pieces = runPieces("flat", pipe(cellA, cellA), SYMBOLS);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].points).toEqual([
      { x: 24, y: 24 },
      { x: 24, y: 24 },
      { x: 24, y: 24 },
    ]);
  });

  it("stops at the centre when the port cannot be resolved", () => {
    const pieces = runPieces(
      "flat",
      pipe({ kind: "port", symbol: "pac", port: "nope" }, cellB),
      SYMBOLS,
    );
    expect(pieces[0].points[0]).toEqual({ x: 24, y: 24 });
  });
});

describe("pieceAt", () => {
  it("finds the piece of a cell, z defaulting to the floor", () => {
    const pieces = runPieces(
      "flat",
      pipe(
        { kind: "cell", cell: { x: 0, y: 0 } },
        { kind: "cell", cell: { x: 0, y: 0, z: 1 } },
      ),
      SYMBOLS,
    );
    expect(pieceAt(pieces, { x: 0, y: 0 })).toBe(pieces[0]);
    expect(pieceAt(pieces, { x: 0, y: 0, z: 1 })).toBe(pieces[1]);
    expect(pieceAt(pieces, { x: 1, y: 0 })).toBeUndefined();
  });
});
