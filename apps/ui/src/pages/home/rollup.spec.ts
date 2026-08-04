import { describe, expect, it } from "vitest";
import type { Asset, AssetType, Device } from "@gridone/sdk";
import { buildFloorRows, countZones, findOrgName } from "./rollup";

/** Builds an asset with a backend-shaped `path` (ancestor ids + own id). */
function asset(
  id: string,
  type: AssetType,
  ancestors: string[] = [],
  extra: Partial<Asset> = {},
): Asset {
  return {
    id,
    name: extra.name ?? id,
    type,
    parent_id: ancestors.at(-1) ?? null,
    path: [...ancestors, id],
    position: 0,
    ...extra,
  };
}

function device(id: string, assetId?: string): Device {
  return {
    id,
    name: id,
    tags: assetId ? { asset_id: assetId } : {},
    config: {},
    driver_id: "driver",
    transport_id: "transport",
  };
}

const org = asset("org1", "org", [], { name: "gridone-demo" });
const building = asset("b1", "building", ["org1"]);
const floor1 = asset("f1", "floor", ["org1", "b1"], { position: 0 });
const floor2 = asset("f2", "floor", ["org1", "b1"], { position: 1 });
const room1 = asset("r1", "room", ["org1", "b1", "f1"]);
const zoneInRoom = asset("z1", "zone", ["org1", "b1", "f1", "r1"]);
const zoneOnFloor2 = asset("z2", "zone", ["org1", "b1", "f2"]);
const strayZone = asset("z3", "zone", ["org1", "b1"]);

const TREE = [
  org,
  building,
  floor1,
  floor2,
  room1,
  zoneInRoom,
  zoneOnFloor2,
  strayZone,
];

describe("countZones", () => {
  it("counts room and zone assets only", () => {
    // r1, z1, z2, z3 — org/building/floors are structure, not zones.
    expect(countZones(TREE)).toBe(4);
  });

  it("returns 0 for an empty tree", () => {
    expect(countZones([])).toBe(0);
  });
});

describe("findOrgName", () => {
  it("returns the org asset's name", () => {
    expect(findOrgName(TREE)).toBe("gridone-demo");
  });

  it("returns null when there is no org asset", () => {
    expect(findOrgName([building, floor1])).toBeNull();
  });

  it("returns null when the org name is blank", () => {
    expect(findOrgName([asset("org1", "org", [], { name: "  " })])).toBeNull();
  });
});

describe("buildFloorRows", () => {
  it("returns no rows when the tree has no floor", () => {
    expect(buildFloorRows([org, building, strayZone], [])).toEqual([]);
  });

  it("orders floors by position, keeping list order on ties", () => {
    const late = asset("f-late", "floor", ["org1"], { position: 2 });
    const early = asset("f-early", "floor", ["org1"], { position: 1 });
    const tieA = asset("f-tie-a", "floor", ["org1"], { position: 1 });
    const rows = buildFloorRows([late, early, tieA], []);
    expect(rows.map((r) => r.floor.id)).toEqual([
      "f-early",
      "f-tie-a",
      "f-late",
    ]);
  });

  it("counts zones through nested rooms, not strays or other floors", () => {
    const rows = buildFloorRows(TREE, []);
    // f1: r1 + z1 (nested under r1); f2: z2. z3 (under building) nowhere.
    expect(rows.map((r) => [r.floor.id, r.zoneCount])).toEqual([
      ["f1", 2],
      ["f2", 1],
    ]);
  });

  it("counts devices tagged on the floor itself and on its descendants", () => {
    const rows = buildFloorRows(TREE, [
      device("d-floor", "f1"),
      device("d-room", "r1"),
      device("d-zone", "z1"),
      device("d-other-floor", "z2"),
    ]);
    expect(rows.map((r) => [r.floor.id, r.deviceCount])).toEqual([
      ["f1", 3],
      ["f2", 1],
    ]);
  });

  it("ignores untagged devices and tags pointing at deleted assets", () => {
    const rows = buildFloorRows(TREE, [
      device("d-untagged"),
      device("d-dangling", "gone"),
    ]);
    expect(rows.map((r) => r.deviceCount)).toEqual([0, 0]);
  });

  it("counts devices in strayless zones for no floor", () => {
    const rows = buildFloorRows(TREE, [device("d-stray", "z3")]);
    expect(rows.map((r) => r.deviceCount)).toEqual([0, 0]);
  });
});
