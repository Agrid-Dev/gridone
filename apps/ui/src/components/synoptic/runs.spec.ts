import type { PipeElement, SymbolElement } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import { PIPE_AXIS_Z, project } from "./projection";
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
    // The last cell of a run ending in the open keeps only its half in,
    // so the arrow has a 24 px segment to sit on.
    expect(pieces.map((p) => p.points)).toEqual([
      [
        { x: 24, y: 24 },
        { x: 24, y: 24 },
        { x: 48, y: 24 },
      ],
      [
        { x: 48, y: 24 },
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
        [
          { x: 3, y: 1 },
          { x: 3, y: 0 },
        ],
      ),
      SYMBOLS,
    );
    // supply leaves (1, 1) through +x, at x = 96: the port cell holds a stub
    // from its centre to that face, and the visible run starts there.
    expect(pieces[0]).toEqual({
      cell: { x: 1, y: 1, z: 0 },
      points: [
        { x: 72, y: 72 },
        { x: 72, y: 72 },
        { x: 96, y: 72 },
      ],
      direction: { x: 1, y: 0 },
      stub: true,
    });
    expect(pieces[1].points[0]).toEqual({ x: 96, y: 72 });
    // primary_in enters (4, 0) through -x, at x = 192. The tank's cylinder
    // never meets that line, so the visible run ends at the face and the
    // stub carries on to the cell centre, where it grazes the cylinder.
    expect(pieces[pieces.length - 2].points[2]).toEqual({ x: 192, y: 24 });
    expect(pieces[pieces.length - 1]).toEqual({
      cell: { x: 4, y: 0, z: 0 },
      points: [
        { x: 192, y: 24 },
        { x: 216, y: 24 },
        { x: 216, y: 24 },
      ],
      direction: { x: 1, y: 0 },
      stub: true,
    });
    expect(pieces.filter((p) => !p.stub).map((p) => p.cell)).toEqual([
      { x: 2, y: 1, z: 0 },
      { x: 3, y: 1, z: 0 },
      { x: 3, y: 0, z: 0 },
    ]);
  });

  it("stops at a collector's bar edge, and at its end face along the bar", () => {
    const across = runPieces(
      "flat",
      pipe(
        { kind: "cell", cell: { x: 4, y: 2 } },
        { kind: "port", symbol: "col", port: "in_1" },
      ),
      SYMBOLS,
    );
    // in_1 faces -x on a bar along y: the bar edge is 0.3 cells in from
    // the face at x = 288, so the run ends at x = 302.4.
    expect(across[1].points[2]).toEqual({ x: 302.4, y: 120 });
    expect(across[2].points[0]).toEqual({ x: 302.4, y: 120 });
    const along = runPieces(
      "flat",
      pipe(
        { kind: "cell", cell: { x: 6, y: -2 } },
        { kind: "port", symbol: "col", port: "out_1" },
      ),
      new Map(
        [
          ...SYMBOLS,
          symbol(
            "col",
            "collector",
            { x: 6, y: 0 },
            {
              props: {
                axis: "y",
                length: 3,
                ports: { out_1: { offset: 0, side: "-y" } },
              },
            },
          ),
        ].map(
          (s) => (Array.isArray(s) ? s : [s.id, s]) as [string, SymbolElement],
        ),
      ),
    );
    // out_1 faces -y along the bar: the bar reaches the face, y = 0.
    expect(along[1].points[2]).toEqual({ x: 312, y: 0 });
  });

  it("stops at the silhouette of a drawing that meets the entry line", () => {
    // plate_exchanger draws a 0.8 square centred in its cell: 0.1 in.
    const pieces = runPieces(
      "flat",
      pipe(
        { kind: "cell", cell: { x: 0, y: 0 } },
        { kind: "port", symbol: "px", port: "primary_in" },
      ),
      new Map([
        ...SYMBOLS,
        ["px", symbol("px", "plate_exchanger", { x: 2, y: 0 })],
      ]),
    );
    expect(pieces[1].points[2]).toEqual({ x: 100.8, y: 24 });
  });

  it("ends at the silhouette along the face the run actually arrives through", () => {
    // primary_in faces -x, but this run drops in from +y: the pipe stops at
    // the face it arrives through and never crosses the body.
    const pieces = runPieces(
      "flat",
      pipe(cellA, { kind: "port", symbol: "b01", port: "primary_in" }, [
        { x: 4, y: 1 },
      ]),
      SYMBOLS,
    );
    // Entering from +y, the line from that face runs through the cylinder
    // and leaves it 0.05 cells short of the cell centre: y = 26.4.
    const visible = pieces.filter((p) => !p.stub);
    expect(visible[visible.length - 1].cell).toEqual({ x: 4, y: 1, z: 0 });
    expect(visible[visible.length - 1].points[2]).toEqual({ x: 216, y: 26.4 });
    expect(pieces[pieces.length - 1].stub).toBe(true);
  });

  it("stops at the face when the run drops in from above", () => {
    const pieces = runPieces(
      "isometric",
      pipe(
        { kind: "cell", cell: { x: 4, y: 0, z: 1 } },
        { kind: "port", symbol: "b01", port: "primary_in" },
      ),
      SYMBOLS,
    );
    // (4, 0, 1) down to (4, 0): the visible piece ends at the face between
    // the two, half a cell above the axis.
    expect(pieces[0].points[2]).toEqual(
      project("isometric", 4.5, 0.5, 0.5 + PIPE_AXIS_Z),
    );
    expect(pieces[1].stub).toBe(true);
  });

  it("draws the run between two ports in adjacent cells as its own piece", () => {
    const pieces = runPieces(
      "isometric",
      pipe(
        { kind: "port", symbol: "mv", port: "out" },
        { kind: "port", symbol: "px", port: "primary_in" },
      ),
      new Map([
        ["mv", symbol("mv", "mixing_valve", { x: 0, y: 0 })],
        ["px", symbol("px", "plate_exchanger", { x: 1, y: 0 })],
      ]),
    );
    expect(pieces.map((p) => p.stub ?? false)).toEqual([true, false, true]);
    // The middle piece runs from one silhouette to the other, so the run
    // has no hole and somewhere to put its arrow.
    const [stubIn, run, stubOut] = pieces;
    expect(run.points[0]).toEqual(stubIn.points[2]);
    expect(run.points[2]).toEqual(stubOut.points[0]);
    expect(run.cell).toEqual({ x: 1, y: 0, z: 0 });
    expect(run.points[0]).toEqual({ x: 10.4, y: 9.2 });
    expect(run.points[2]).toEqual({ x: 24, y: 16 });
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
    // A riser at the end of a run along +y keeps +y, not the +x default.
    const riser = runPieces(
      "isometric",
      pipe(cellA, { kind: "cell", cell: { x: 0, y: 2, z: 1 } }, [
        { x: 0, y: 2 },
      ]),
      SYMBOLS,
    );
    expect(riser.map((p) => p.direction)).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ]);
    // A run that climbs first takes the direction it goes on to.
    const climb = runPieces(
      "isometric",
      pipe(cellA, { kind: "cell", cell: { x: 0, y: 2, z: 1 } }, [
        { x: 0, y: 0, z: 1 },
      ]),
      SYMBOLS,
    );
    expect(climb[0].direction).toEqual({ x: 0, y: 1 });
    // A bare riser has no plan direction at all: +x by convention.
    const bare = runPieces(
      "isometric",
      pipe(cellA, { kind: "cell", cell: { x: 0, y: 0, z: 1 } }),
      SYMBOLS,
    );
    expect(bare.map((p) => p.direction)).toEqual([
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
    ]);
  });

  it("keeps the cell and stops at its centre when the port cannot be resolved", () => {
    const pieces = runPieces(
      "flat",
      pipe({ kind: "port", symbol: "pac", port: "nope" }, cellB),
      SYMBOLS,
    );
    expect(pieces).toHaveLength(2);
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
