import { describe, it, expect } from "vitest";
import type { Asset } from "@gridone/sdk";
import {
  ancestorPathOf,
  flattenDeviceAssets,
  sortedByPosition,
  zonePathOf,
  type AssetTreeNode,
} from "./assets";

function asset(id: string, name: string, path: string[]): Asset {
  return {
    id,
    parent_id: null,
    type: "zone",
    name,
    path,
    position: 0,
  } as Asset;
}

const building = asset("b1", "Building A", ["b1"]);
const floor = asset("f1", "Floor 1", ["b1", "f1"]);
const room = asset("r1", "Room 101", ["b1", "f1", "r1"]);

const assetsById: Record<string, Asset> = {
  b1: building,
  f1: floor,
  r1: room,
};

describe("ancestorPathOf", () => {
  it("returns an empty string for a root asset", () => {
    expect(ancestorPathOf(building, assetsById)).toBe("");
  });

  it("joins ancestor names with a chevron, excluding the asset itself", () => {
    expect(ancestorPathOf(room, assetsById)).toBe("Building A › Floor 1");
  });

  it("skips ancestors missing from the lookup instead of emitting undefined", () => {
    const orphan = asset("x1", "Room 9", ["b1", "gone", "x1"]);
    expect(ancestorPathOf(orphan, assetsById)).toBe("Building A");
  });

  it("tolerates an absent path", () => {
    const pathless = { ...building, path: undefined } as unknown as Asset;
    expect(ancestorPathOf(pathless, assetsById)).toBe("");
  });
});

describe("zonePathOf", () => {
  const typed = (
    id: string,
    name: string,
    type: Asset["type"],
    path: string[],
  ): Asset => ({ ...asset(id, name, path), type });

  const org = typed("o1", "Acme", "org", ["o1"]);
  const site = typed("b1", "Building A", "building", ["o1", "b1"]);
  const level = typed("f1", "Floor 2", "floor", ["o1", "b1", "f1"]);
  const bedroom = typed("r1", "Room 201", "room", ["o1", "b1", "f1", "r1"]);
  const byId: Record<string, Asset> = {
    o1: org,
    b1: site,
    f1: level,
    r1: bedroom,
  };

  it("joins the zone-level chain, the asset itself included", () => {
    expect(zonePathOf(bedroom, byId)).toBe("Floor 2 · Room 201");
  });

  it("drops the org and building levels", () => {
    expect(zonePathOf(site, byId)).toBe("");
    expect(zonePathOf(level, byId)).toBe("Floor 2");
  });

  it("skips ancestors missing from the lookup", () => {
    const orphan = typed("r2", "Room 9", "room", ["o1", "gone", "r2"]);
    expect(zonePathOf(orphan, { ...byId, r2: orphan })).toBe("Room 9");
  });

  it("falls back to the asset itself when it carries no path", () => {
    const pathless = { ...bedroom, path: undefined } as unknown as Asset;
    expect(zonePathOf(pathless, byId)).toBe("Room 201");
  });
});

describe("sortedByPosition", () => {
  it("orders by position ascending, name as tiebreaker, without mutating", () => {
    const items = [
      { name: "Quatrième étage", position: 3 },
      { name: "Second Etage", position: 1 },
      { name: "annexe", position: 1 },
      { name: "Premier Etage", position: 0 },
    ];
    expect(sortedByPosition(items).map((item) => item.name)).toEqual([
      "Premier Etage",
      "annexe",
      "Second Etage",
      "Quatrième étage",
    ]);
    expect(items[0].name).toBe("Quatrième étage");
  });

  it("treats a missing position as zero", () => {
    const items = [
      { name: "B", position: 1 },
      { name: "A", position: undefined },
    ];
    expect(sortedByPosition(items).map((item) => item.name)).toEqual([
      "A",
      "B",
    ]);
  });
});

function node(
  base: Asset,
  devices: { id: string; name: string }[] = [],
  children: AssetTreeNode[] = [],
): AssetTreeNode {
  return { ...base, devices, children };
}

describe("flattenDeviceAssets", () => {
  it("maps each embedded device to the node it hangs off", () => {
    const tree = [
      node(
        building,
        [{ id: "d1", name: "Chiller" }],
        [node(floor, [{ id: "d2", name: "AHU" }])],
      ),
    ];
    const byDevice = flattenDeviceAssets(tree);
    expect(byDevice.d1.name).toBe("Building A");
    expect(byDevice.d2.name).toBe("Floor 1");
  });

  it("omits devices attached to no asset", () => {
    expect(flattenDeviceAssets([node(building)])).toEqual({});
  });

  it("tolerates nodes without a devices key", () => {
    const bare = { ...building, children: [] } as AssetTreeNode;
    expect(flattenDeviceAssets([bare])).toEqual({});
  });

  it("returns plain assets, dropping the tree-only keys", () => {
    const tree = [node(room, [{ id: "d1", name: "Sensor" }])];
    expect(flattenDeviceAssets(tree).d1).toEqual(room);
  });

  it("returns an empty map for an empty tree", () => {
    expect(flattenDeviceAssets([])).toEqual({});
  });
});
