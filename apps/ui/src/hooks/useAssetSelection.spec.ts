import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AssetType } from "@gridone/sdk";
import type { AssetTreeNode } from "@/lib/assets";
import { useAssetSelection } from "./useAssetSelection";

function node(
  id: string,
  type: AssetType,
  children: AssetTreeNode[] = [],
): AssetTreeNode {
  return {
    id,
    type,
    name: id,
    parent_id: null,
    path: [id],
    position: 0,
    children,
  };
}

const salon = node("salon", "zone");
const suite = node("suite", "room", [salon]);
const room = node("room", "room");
const floor = node("floor", "floor", [suite, room]);
const emptyFloor = node("empty", "floor");
const building = node("building", "building", [floor, emptyFloor]);

describe("useAssetSelection", () => {
  it("starts empty with every checkbox unticked", () => {
    const { result } = renderHook(() => useAssetSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.stateOf(building)).toBe("none");
  });

  it("ticking a floor selects the rooms and zones beneath it, not the floor", () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.toggle(floor));

    expect([...result.current.selectedIds].sort()).toEqual([
      "room",
      "salon",
      "suite",
    ]);
    expect(result.current.stateOf(floor)).toBe("all");
    expect(result.current.stateOf(building)).toBe("all");
  });

  it("reports a partial selection as some, up the tree", () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.toggle(room));

    expect(result.current.stateOf(room)).toBe("all");
    expect(result.current.stateOf(floor)).toBe("some");
    expect(result.current.stateOf(building)).toBe("some");
    expect(result.current.stateOf(suite)).toBe("none");
  });

  it("ticking a partially selected node completes it; ticking a full one clears it", () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.toggle(room));
    act(() => result.current.toggle(floor));
    expect(result.current.stateOf(floor)).toBe("all");

    act(() => result.current.toggle(floor));
    expect(result.current.count).toBe(0);
  });

  it("ignores a node with nothing selectable beneath it", () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.toggle(emptyFloor));

    expect(result.current.count).toBe(0);
  });

  it("clears the whole selection", () => {
    const { result } = renderHook(() => useAssetSelection());

    act(() => result.current.toggle(building));
    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
    expect(result.current.stateOf(building)).toBe("none");
  });
});
