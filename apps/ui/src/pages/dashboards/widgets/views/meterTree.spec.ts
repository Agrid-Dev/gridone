import { describe, it, expect } from "vitest";
import type { MeterTreeNode } from "@gridone/sdk";
import {
  buildMeterTreeRows,
  collectMeterKeys,
  meterKey,
  parseMeterKey,
  type MeterTreeRow,
  type MeterValues,
} from "./meterTree";

const meter = (id: string, attribute = "energy") => ({
  devices: { ids: [id] },
  attribute,
});

const node = (
  label: string,
  meter: MeterTreeNode["meter"],
  children: MeterTreeNode[] = [],
): MeterTreeNode => ({ label, meter, children });

/** Readings keyed the way the module keys them, so tests name devices. */
const readings = (entries: Record<string, number | null>): MeterValues =>
  new Map(
    Object.entries(entries).map(([id, value]) => [
      meterKey(meter(id)) as string,
      value,
    ]),
  );

const byLabel = (rows: MeterTreeRow[], label: string) =>
  rows.find((r) => r.kind === "meter" && r.label === label);

const residuals = (rows: MeterTreeRow[]) =>
  rows.filter((r) => r.kind === "residual");

describe("buildMeterTreeRows", () => {
  it("gives each node its share of the parent, and the parent its remainder", () => {
    const tree = node("Building", meter("main"), [
      node("HVAC", meter("a")),
      node("Lighting", meter("b")),
    ]);

    const rows = buildMeterTreeRows(
      tree,
      readings({ main: 100, a: 40, b: 30 }),
    );

    expect(byLabel(rows, "HVAC")).toMatchObject({
      total: 40,
      ratioOfParent: 0.4,
    });
    expect(byLabel(rows, "Lighting")).toMatchObject({
      total: 30,
      ratioOfParent: 0.3,
    });
    expect(residuals(rows)).toEqual([
      expect.objectContaining({
        total: 30,
        ratioOfParent: 0.3,
        negative: false,
      }),
    ]);
  });

  // The case that motivated the whole design: in a real building three branches
  // metered MORE than the feeder above them. Normalising the shares to 100%
  // would make the tree look consistent and hide exactly that.
  it("lets children exceed 100% of a parent they out-measure", () => {
    const tree = node("Feeder", meter("main"), [
      node("A", meter("a")),
      node("B", meter("b")),
    ]);

    const rows = buildMeterTreeRows(
      tree,
      readings({ main: 100, a: 80, b: 50 }),
    );

    const shares = rows
      .filter((r) => r.kind === "meter" && r.depth === 1)
      .map((r) => r.ratioOfParent);
    expect(shares).toEqual([0.8, 0.5]);
    expect(residuals(rows)[0]).toMatchObject({ total: -30, negative: true });
  });

  it("stands an unmetered node in for the children it groups", () => {
    // A riser feeding several floors is routinely unmetered itself.
    const tree = node("Riser", null, [
      node("F1", meter("a")),
      node("F2", meter("b")),
    ]);

    const rows = buildMeterTreeRows(tree, readings({ a: 40, b: 60 }));

    expect(byLabel(rows, "Riser")).toMatchObject({
      total: 100,
      state: "unmetered",
    });
    // Nothing measured the riser, so there is no remainder to account for.
    expect(residuals(rows)).toEqual([]);
  });

  it("keeps computing children under a node whose own meter is dead", () => {
    const tree = node("Dead parent", meter("main"), [
      node("Child", meter("a")),
    ]);

    const rows = buildMeterTreeRows(tree, readings({ main: null, a: 25 }));

    expect(byLabel(rows, "Dead parent")).toMatchObject({
      total: null,
      state: "unknown",
    });
    expect(byLabel(rows, "Child")).toMatchObject({
      total: 25,
      // There is no denominator, so a share would be invented.
      ratioOfParent: null,
    });
    expect(residuals(rows)).toEqual([]);
  });

  it("flags a residual whose children sum is missing a meter", () => {
    // Otherwise this reads as a confident "40% unmetered" when the truth is
    // that one of the sub-meters simply is not reporting.
    const tree = node("Building", meter("main"), [
      node("Measured", meter("a")),
      node("Silent", meter("b")),
    ]);

    const rows = buildMeterTreeRows(
      tree,
      readings({ main: 100, a: 60, b: null }),
    );

    expect(residuals(rows)[0]).toMatchObject({ total: 40, incomplete: true });
  });

  it("confines a dead meter's doubt to the residual it actually affects", () => {
    // "Sub" measured itself, so what happens under it cannot change the figure
    // it hands upward: the building's residual is exact. Sub's own residual is
    // not — the sum it subtracts is missing the silent meter.
    const tree = node("Building", meter("main"), [
      node("Sub", meter("a"), [node("Silent", meter("b"))]),
    ]);

    const rows = buildMeterTreeRows(
      tree,
      readings({ main: 100, a: 60, b: null }),
    );

    const [subResidual, buildingResidual] = residuals(rows);
    expect(subResidual).toMatchObject({
      depth: 2,
      total: 60,
      incomplete: true,
    });
    expect(buildingResidual).toMatchObject({
      depth: 1,
      total: 40,
      incomplete: false,
    });
  });

  it("treats a zero reading as a real answer, not a missing one", () => {
    // Newly commissioned counters sit at zero consumption; that is data.
    const tree = node("Building", meter("main"), [node("Idle", meter("a"))]);

    const rows = buildMeterTreeRows(tree, readings({ main: 50, a: 0 }));

    expect(byLabel(rows, "Idle")).toMatchObject({
      total: 0,
      ratioOfParent: 0,
      state: "ok",
    });
  });

  it("marks negative consumption as a counter reset, not a residual problem", () => {
    // `delta` passes meter replacements through as a backwards index. That is a
    // fault in the meter, distinct from children out-measuring their parent.
    const tree = node("Replaced", meter("main"), [node("Child", meter("a"))]);

    const rows = buildMeterTreeRows(tree, readings({ main: -12, a: 5 }));

    expect(byLabel(rows, "Replaced")).toMatchObject({
      total: -12,
      state: "reset",
    });
    // Shares of a backwards total would be nonsense.
    expect(byLabel(rows, "Child")?.ratioOfParent).toBeNull();
  });

  it("declines to divide by a parent that consumed nothing", () => {
    const tree = node("Building", meter("main"), [node("Child", meter("a"))]);

    const rows = buildMeterTreeRows(tree, readings({ main: 0, a: 0 }));

    expect(byLabel(rows, "Child")?.ratioOfParent).toBeNull();
  });

  it("emits parents before children, with depth and stable keys", () => {
    const tree = node("Root", meter("main"), [
      node("A", meter("a"), [node("A1", meter("a1"))]),
      node("B", meter("b")),
    ]);

    const rows = buildMeterTreeRows(
      tree,
      readings({ main: 10, a: 4, a1: 2, b: 3 }),
    );

    expect(
      rows.map((r) => [r.kind === "meter" ? r.label : "residual", r.depth]),
    ).toEqual([
      ["Root", 0],
      ["A", 1],
      ["A1", 2],
      ["residual", 2],
      ["B", 1],
      ["residual", 1],
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});

describe("collectMeterKeys", () => {
  it("returns one key per distinct meter, skipping unmetered nodes", () => {
    // Two nodes may reference the same meter; the fan-out is one request per
    // meter, not per node.
    const tree = node("Root", null, [
      node("A", meter("shared")),
      node("B", meter("shared")),
      node("C", meter("other")),
    ]);

    expect(collectMeterKeys(tree)).toEqual([
      meterKey(meter("shared")),
      meterKey(meter("other")),
    ]);
  });
});

describe("meterKey", () => {
  it("is null for a node that declares no meter", () => {
    expect(meterKey(null)).toBeNull();
    expect(meterKey(undefined)).toBeNull();
  });

  it("round-trips through parseMeterKey", () => {
    // The fetch layer rebuilds the request from the key, so a separator that
    // could appear in either half would silently address the wrong series.
    expect(parseMeterKey(meterKey(meter("d1", "active_energy"))!)).toEqual({
      deviceId: "d1",
      attribute: "active_energy",
    });
  });

  it("separates device from attribute unambiguously", () => {
    expect(meterKey(meter("d1", "active_energy"))).not.toEqual(
      meterKey(meter("d1_active", "energy")),
    );
  });
});

describe("node scale", () => {
  // Installations arrive with counters on differing scales — a circuit in Wh
  // beside siblings in kWh — and the tree can say nothing true about numbers
  // that are not in the same unit.
  it("calibrates a reading before deriving anything from it", () => {
    const tree = node("Building", meter("main"), [
      node("In kWh", meter("a")),
      { ...node("In Wh", meter("b")), scale: 0.001 },
    ]);

    const rows = buildMeterTreeRows(
      tree,
      readings({ main: 100, a: 40, b: 30000 }),
    );

    expect(byLabel(rows, "In Wh")).toMatchObject({
      total: 30,
      ratioOfParent: 0.3,
    });
    // The residual is computed from calibrated children, not raw ones.
    expect(residuals(rows)[0]).toMatchObject({ total: 30, negative: false });
  });

  it("leaves an uncalibrated node alone", () => {
    const tree = node("Building", meter("main"), [node("Plain", meter("a"))]);

    const rows = buildMeterTreeRows(tree, readings({ main: 100, a: 40 }));

    expect(byLabel(rows, "Plain")).toMatchObject({ total: 40 });
  });
});
