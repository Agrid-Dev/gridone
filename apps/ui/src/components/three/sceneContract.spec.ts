import { describe, expect, it } from "vitest";
import { Group, Mesh, Object3D } from "three";
import {
  explodedOffsets,
  findSpaceAncestor,
  parseBuildingScene,
} from "./sceneContract";

function makeScene(): {
  root: Group;
  spaceMesh: Mesh;
} {
  const root = new Group();

  const storey1 = new Object3D();
  storey1.userData = {
    kind: "storey",
    global_id: "st-1",
    name: "Level 1",
    elevation: 3,
    index: 1,
  };
  const storey0 = new Object3D();
  storey0.userData = {
    kind: "storey",
    global_id: "st-0",
    name: "Level 0",
    elevation: 0,
    index: 0,
  };

  const geometry = new Mesh();
  geometry.userData = { kind: "geometry" };
  storey0.add(geometry);

  const spacesGroup = new Object3D();
  spacesGroup.userData = { kind: "spaces" };
  const spaceNode = new Object3D();
  spaceNode.userData = { kind: "space", global_id: "sp-1", name: "Room 001" };
  const spaceMesh = new Mesh();
  spaceNode.add(spaceMesh);
  spacesGroup.add(spaceNode);
  storey0.add(spacesGroup);

  const unassigned = new Object3D();
  unassigned.userData = { kind: "unassigned" };

  // Deliberately out of order — parse must sort by extras.index.
  root.add(storey1, storey0, unassigned);
  return { root, spaceMesh };
}

describe("parseBuildingScene", () => {
  it("collects storeys sorted by index with their spaces", () => {
    const { root } = makeScene();
    const parsed = parseBuildingScene(root);

    expect(parsed.storeys.map((s) => s.globalId)).toEqual(["st-0", "st-1"]);
    expect(parsed.storeys[0].elevation).toBe(0);
    expect(parsed.storeys[0].spaces).toHaveLength(1);
    expect(parsed.storeys[0].spaces[0]).toMatchObject({
      globalId: "sp-1",
      name: "Room 001",
    });
    expect(parsed.storeys[1].spaces).toHaveLength(0);
    expect(parsed.unassigned).not.toBeNull();
  });

  it("handles a scene without storeys", () => {
    const root = new Group();
    const parsed = parseBuildingScene(root);
    expect(parsed.storeys).toEqual([]);
    expect(parsed.unassigned).toBeNull();
  });
});

describe("findSpaceAncestor", () => {
  it("walks up from a mesh to its space node", () => {
    const { spaceMesh } = makeScene();
    const found = findSpaceAncestor(spaceMesh);
    expect(found?.userData.global_id).toBe("sp-1");
  });

  it("returns null outside any space", () => {
    const lone = new Mesh();
    expect(findSpaceAncestor(lone)).toBeNull();
    expect(findSpaceAncestor(null)).toBeNull();
  });
});

describe("explodedOffsets", () => {
  it("spreads storeys linearly and collapses at zero spread", () => {
    expect(explodedOffsets(3, 2, 1)).toEqual([0, 2, 4]);
    expect(explodedOffsets(3, 2, 0)).toEqual([0, 0, 0]);
    expect(explodedOffsets(0, 2, 1)).toEqual([]);
  });
});
