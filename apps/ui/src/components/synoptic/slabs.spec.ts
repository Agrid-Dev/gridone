import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Cell, SymbolElement, Synoptic } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import { SLAB_GAP, SLAB_PAD, slabsOf } from "./slabs";
import type { PlanRect } from "./symbols/footprint";

const machine = (
  id: string,
  type: string,
  cell: Cell,
  rotation = 0,
): SymbolElement => ({
  id,
  type,
  placement: { kind: "cell", cell, rotation },
});

const rect = (x0: number, y0: number, x1: number, y1: number) =>
  ({ x0, y0, x1, y1 }) as const;

/** A slab compared to a hundredth of a cell, since the pad is a float. */
const near = (slab: PlanRect, expected: PlanRect) => {
  expect(slab.x0).toBeCloseTo(expected.x0);
  expect(slab.y0).toBeCloseTo(expected.y0);
  expect(slab.x1).toBeCloseTo(expected.x1);
  expect(slab.y1).toBeCloseTo(expected.y1);
};

describe("slabsOf", () => {
  it("stands machines closer than SLAB_GAP cells on one slab, and further apart on their own", () => {
    expect(SLAB_GAP).toBe(3);
    // Two pumps with two empty cells between them: one slab over both.
    const close = slabsOf([
      machine("a", "pump", { x: 0, y: 0 }),
      machine("b", "pump", { x: 3, y: 0 }),
    ]);
    expect(close).toHaveLength(1);
    near(close[0], rect(-0.7, -0.7, 4.7, 1.7));
    // Three empty cells between them is the gap itself: apart.
    expect(
      slabsOf([
        machine("a", "pump", { x: 0, y: 0 }),
        machine("b", "pump", { x: 4, y: 0 }),
      ]),
    ).toHaveLength(2);
    // Close along x but four rows apart is apart: both axes must be near.
    expect(
      slabsOf([
        machine("a", "pump", { x: 0, y: 0 }),
        machine("b", "pump", { x: 2, y: 5 }),
      ]),
    ).toHaveLength(2);
  });

  it("reaches SLAB_PAD past the footprints it carries", () => {
    expect(SLAB_PAD).toBe(0.7);
    // A tank is one cell by two: the slab pads that, not the cell.
    const [slab] = slabsOf([machine("b01", "tank", { x: 2, y: 3 })]);
    near(slab, rect(1.3, 2.3, 3.7, 5.7));
  });

  it("carries the drawn machines only: no bar, no off-page connector, nothing raised, no unknown type", () => {
    const slabs = slabsOf([
      {
        ...machine("bar", "collector", { x: 0, y: 0 }),
        props: { axis: "x", length: 5, ports: {} },
      },
      machine("link", "link", { x: 2, y: 0 }),
      machine("raised", "heat_pump", { x: 5, y: 5, z: 1 }),
      machine("mystery", "reactor", { x: 8, y: 8 }),
      machine("p", "pump", { x: 0, y: 3, z: 0 }),
    ]);
    expect(slabs).toHaveLength(1);
    near(slabs[0], rect(-0.7, 2.3, 1.7, 4.7));
  });

  it("counts a machine riding a run as equipment on the floor", () => {
    const slabs = slabsOf([
      {
        id: "p",
        type: "pump",
        placement: { kind: "pipe", pipe: "run", cell: { x: 4, y: 4 } },
      },
    ]);
    expect(slabs).toHaveLength(1);
    near(slabs[0], rect(3.3, 3.3, 5.7, 5.7));
  });

  it("reads a turned footprint where it is drawn", () => {
    // A tank at (4, 4) upright covers x in [4, 5): three cells from a
    // pump at (0, 4), apart. A quarter turn lays it over x in [3, 5):
    // two cells from the pump, one slab.
    const pump = machine("p", "pump", { x: 0, y: 4 });
    expect(slabsOf([pump, machine("b", "tank", { x: 4, y: 4 })])).toHaveLength(
      2,
    );
    const turned = slabsOf([pump, machine("b", "tank", { x: 4, y: 4 }, 1)]);
    expect(turned).toHaveLength(1);
    near(turned[0], rect(-0.7, 3.3, 5.7, 5.7));
  });

  it("merges the groups a late machine bridges", () => {
    // The two ends come first and stand apart; the middle one is near
    // both, so the three end up on one slab.
    const slabs = slabsOf([
      machine("c", "pump", { x: 6, y: 0 }),
      machine("a", "pump", { x: 0, y: 0 }),
      machine("b", "pump", { x: 3, y: 0 }),
    ]);
    expect(slabs).toHaveLength(1);
    near(slabs[0], rect(-0.7, -0.7, 7.7, 1.7));
  });

  it("comes out back to front, whatever the order of the symbols", () => {
    const slabs = slabsOf([
      machine("front", "pump", { x: 10, y: 0 }),
      machine("back", "pump", { x: 0, y: 5 }),
    ]);
    // In the isometric view x + y grows towards the viewer: the slab at
    // (0, 5) is behind the one at (10, 0).
    expect(slabs.map((s) => Math.round(s.x0 + s.y0))).toEqual([4, 9]);
  });

  it("merges a lone machine's slab into a group's padded frame it would overlap", () => {
    // Three machines chain into one group whose frame spans (0,0)..(6,4);
    // a fourth at (-1, 5) is three cells or more from each of them, so it
    // gets a slab of its own, and that slab overlaps the corner of the
    // group's. The gap rule reads footprints, the pad reads the union:
    // Ouest's loop heater stands like this beside its mixer group.
    const slabs = slabsOf([
      machine("p", "pump", { x: 0, y: 0 }),
      machine("r", "pump", { x: 3, y: 1 }),
      machine("q", "pump", { x: 5, y: 3 }),
      machine("d", "pump", { x: -1, y: 5 }),
    ]);
    // Two slabs never overlap: they are one, so no lip is drawn across a
    // slab. Ouest's loop heater stands like this beside its mixer group.
    expect(slabs).toHaveLength(1);
    near(slabs[0], rect(-1.7, -0.7, 6.7, 6.7));
    // Two slabs that keep clear of each other stay two.
    const apart = slabsOf([
      machine("p", "pump", { x: 0, y: 0 }),
      machine("d", "pump", { x: 0, y: 6 }),
    ]);
    expect(apart).toHaveLength(2);
    expect(apart[0].y1).toBeLessThanOrEqual(apart[1].y0);
  });

  it("is empty for a plate with no machine", () => {
    expect(slabsOf([])).toEqual([]);
  });

  describe("the committed plates", () => {
    const PLATES_DIR = resolve(
      import.meta.dirname,
      "../../../../../docs/specs/synoptic",
    );
    const plate = (name: string): Synoptic => ({
      ...JSON.parse(readFileSync(resolve(PLATES_DIR, `${name}.json`), "utf8")),
      id: name,
      metadata: {},
    });

    // What the gap rule makes of each plate. On the ECS bays the two heat
    // pumps stand two rows apart with their isolation valves one cell to
    // the side: one slab for the four. The tanks stand in columns four
    // cells apart (x 10, 14, 18): three empty cells between columns is
    // the gap itself, so each column is its own slab, and a column's
    // tanks, two rows apart, share it. The mixer and the booster pump are
    // two cells apart on one slab; on Ouest the loop pump joins them and
    // the loop heater's own slab merges into theirs, on Est both stand
    // alone. On the
    // production plates the distribution circuits are lone inline
    // machines four to six cells from anything, each on its own slab;
    // only the primary's control valve and meter, the expansion vessel
    // and the dirt separator, and the change-over valve trios share.
    it.each([
      ["ecs-est", 7, rect(-0.7, -0.7, 4.7, 6.7)],
      // Ouest: the loop heater's slab overlapped the mixer group's frame,
      // so the two are one distribution slab.
      ["ecs-ouest", 5, rect(21.3, -3.7, 29.7, 2.7)],
      ["production-chaud", 20, rect(43.3, -7.7, 47.7, -3.3)],
      ["production-froid", 12, rect(23.3, 1.3, 28.7, 5.7)],
    ])("groups %s into %i slabs", (name, count, sample) => {
      const doc = plate(name);
      const slabs = slabsOf(doc.symbols ?? []);
      expect(slabs).toHaveLength(count);
      const found = slabs.find(
        (s) =>
          Math.abs(s.x0 - sample.x0) < 0.01 &&
          Math.abs(s.y0 - sample.y0) < 0.01,
      );
      expect(found).toBeDefined();
      near(found!, sample);
      // Every machine on the floor stands on exactly one slab.
      for (const symbol of doc.symbols ?? []) {
        if (["collector", "link"].includes(symbol.type)) continue;
        const { x, y } = symbol.placement.cell;
        const on = slabs.filter(
          (s) =>
            x + 0.5 > s.x0 &&
            x + 0.5 < s.x1 &&
            y + 0.5 > s.y0 &&
            y + 0.5 < s.y1,
        );
        expect(on.length, symbol.id).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
