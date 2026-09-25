import { describe, expect, it } from "vitest";
import type { Cell, PipeElement, SymbolElement } from "@gridone/sdk";
import { emptyDocument } from "./document";
import { freshOverlaps, pipeOverlaps } from "./occupancy";

const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
const run = (id: string, from: Cell, to: Cell): PipeElement => ({
  id,
  fluid: "dhw",
  from: { kind: "cell", cell: from },
  to: { kind: "cell", cell: to },
});
const supply = run("supply", at(1, 1), at(6, 1));
const plate = (pipes: PipeElement[], symbols: SymbolElement[] = []) => ({
  ...emptyDocument("p"),
  pipes,
  symbols,
});
const found = (pipes: PipeElement[], symbols: SymbolElement[] = []) =>
  pipeOverlaps(plate(pipes, symbols)).map(({ pipes, cells }) => ({
    pipes,
    cells: [...cells],
  }));

// Mirror the fixtures in packages/synoptics/tests/unit/test_validation.py:
// the exemptions belong to a pair, never to every pipe at that cell.
describe("backend overlap parity", () => {
  it.each([0, 1])("compares crossings at height %i", (z) => {
    expect(found([supply, run("riser", at(4, -2, z), at(4, 4, z))])).toEqual(
      z ? [] : [{ pipes: ["supply", "riser"], cells: ["4,1,0"] }],
    );
  });

  it("excuses a tee's pair only, in either endpoint direction", () => {
    const branch: PipeElement = {
      ...run("branch", at(4, 1), at(4, -3)),
      from: { kind: "pipe", pipe: "supply", cell: at(4, 1) },
    };
    const riser = run("riser", at(4, 4), at(4, 1));
    for (const tee of [
      branch,
      { ...branch, from: branch.to, to: branch.from },
    ]) {
      expect(found([supply, tee])).toEqual([]);
      expect(found([supply, tee, riser])).toEqual([
        { pipes: ["supply", "riser"], cells: ["4,1,0"] },
        { pipes: ["branch", "riser"], cells: ["4,1,0"] },
      ]);
    }
  });

  it("excuses shared ports but reports a third pipe passing through them", () => {
    const tank: SymbolElement = {
      id: "b01",
      type: "tank",
      placement: { kind: "cell", cell: at(8, 0), rotation: 0 },
      props: { capacity: "500 L" },
    };
    const feed: PipeElement = {
      ...run("feed", at(6, 0), at(8, 0)),
      to: { kind: "port", symbol: "b01", port: "primary_in" },
    };
    const draw: PipeElement = {
      ...run("draw", at(8, 0), at(10, 0)),
      from: { kind: "port", symbol: "b01", port: "dhw_out" },
    };
    expect(found([feed, draw], [tank])).toEqual([]);
    expect(
      found([feed, draw, run("riser", at(8, -2), at(8, 2))], [tank]),
    ).toEqual([
      { pipes: ["feed", "riser"], cells: ["8,0,0"] },
      { pipes: ["draw", "riser"], cells: ["8,0,0"] },
    ]);
  });

  it("reports an extra cell in an existing pair, regardless of pipe order", () => {
    const before = pipeOverlaps(
      plate([supply, run("other", at(4, 1), at(4, 3))]),
    );
    const after = pipeOverlaps(
      plate([run("other", at(4, 1), at(5, 1)), supply]),
    );
    expect(freshOverlaps(before, before)).toEqual([]);
    expect(freshOverlaps(after, before)).toEqual([
      { pipes: ["other", "supply"], cells: new Set(["5,1,0"]) },
    ]);
  });
});
