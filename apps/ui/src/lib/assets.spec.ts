import { describe, it, expect } from "vitest";
import type { Asset } from "@gridone/sdk";
import { ancestorPathOf } from "./assets";

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
