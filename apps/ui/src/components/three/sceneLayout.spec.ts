import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, Object3D } from "three";
import { parseBuildingScene } from "./sceneContract";
import { buildSceneLayout } from "./sceneLayout";
import { markerOf } from "./spaceMaterials";

function box(width: number, height: number, depth: number, y: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(width, height, depth));
  mesh.position.y = y;
  return mesh;
}

function geometry(category: string, mesh: Mesh): Object3D {
  const node = new Object3D();
  node.userData = { kind: "geometry", category };
  node.add(mesh);
  return node;
}

function space(globalId: string, mesh: Mesh): Object3D {
  const node = new Object3D();
  node.userData = { kind: "space", global_id: globalId, name: globalId };
  node.add(mesh);
  return node;
}

/**
 * Two storeys 3 m apart, geometry baked in world coordinates the way the
 * converter writes it: a slab, a wall, a facade panel and one room each,
 * plus an unassigned terrain mesh. Storey nodes carry a stale explode offset,
 * as a scene cached from a previous mount would.
 */
function makeBuilding() {
  const root = new Group();
  const parts: Record<string, Mesh> = {};
  [0, 1].forEach((index) => {
    const elevation = index * 3;
    const storey = new Object3D();
    storey.userData = {
      kind: "storey",
      global_id: `st-${index}`,
      name: `L${index}`,
      elevation,
      index,
    };
    storey.position.y = 7;
    parts[`slab-${index}`] = box(10, 0.3, 8, elevation);
    parts[`wall-${index}`] = box(0.2, 2.7, 8, elevation + 1.5);
    parts[`facade-${index}`] = box(10, 2.7, 0.1, elevation + 1.5);
    parts[`room-${index}`] = box(4, 2.7, 4, elevation + 1.5);
    storey.add(
      geometry("slab", parts[`slab-${index}`]),
      geometry("structure", parts[`wall-${index}`]),
      geometry("envelope", parts[`facade-${index}`]),
      space(`sp-${index}`, parts[`room-${index}`]),
    );
    root.add(storey);
  });
  const terrain = new Object3D();
  terrain.userData = { kind: "unassigned" };
  parts.terrain = box(30, 0.1, 30, -0.2);
  terrain.add(geometry("slab", parts.terrain));
  root.add(terrain);
  return { root, parts };
}

describe("buildSceneLayout", () => {
  it("grounds every storey before measuring", () => {
    const { root } = makeBuilding();
    const parsed = parseBuildingScene(root);
    const layout = buildSceneLayout(root, parsed);

    for (const storey of parsed.storeys) {
      expect(storey.object.position.y).toBe(0);
    }
    expect(layout.minY).toBeCloseTo(-0.25);
    expect(layout.size.x).toBeCloseTo(30);
    expect(layout.size.y).toBeCloseTo(6.1);
    expect(layout.size.z).toBeCloseTo(30);
    expect(layout.storeyBoxes.get("st-1")?.min.y).toBeCloseTo(2.85);
    expect(layout.storeyBoxes.get("st-1")?.max.y).toBeCloseTo(5.85);
  });

  it("keeps the room volume when a cached scene is dressed a second time", () => {
    const { root, parts } = makeBuilding();
    const parsed = parseBuildingScene(root);
    buildSceneLayout(root, parsed);
    // The viewer hangs its outline and device marker off the volume, and both
    // survive in the scene graph the query cache hands the next mount. A
    // marker is a Mesh whose ancestor is the space, so an unguarded re-dress
    // would take it for the room — and win, traversal being parent-first.
    const marker = markerOf(parts["room-0"]);

    const second = buildSceneLayout(root, parsed);
    expect(second.spaceMeshes.get("sp-0")).toBe(parts["room-0"]);
    expect(second.spaceMeshes.get("sp-0")).not.toBe(marker);
    expect(second.created).not.toContain(marker.material);
  });

  it("gives each room its own fill and outline, the massing its storey's set", () => {
    const { root, parts } = makeBuilding();
    const layout = buildSceneLayout(root, parseBuildingScene(root));

    expect([...layout.spaceMeshes.keys()]).toEqual(["sp-0", "sp-1"]);
    expect(parts["room-0"].material).not.toBe(parts["room-1"].material);
    expect(parts["room-0"].userData.edgesObject).toBeDefined();

    const stage0 = layout.storeyMaterials.get("st-0")!;
    expect(parts["slab-0"].material).toBe(stage0.slab);
    expect(parts["wall-0"].material).toBe(stage0.structure);
    expect(parts["facade-0"].material).toBe(stage0.envelope);
    expect(parts["slab-1"].material).not.toBe(stage0.slab);
    // Unassigned geometry shares the one set that belongs to no storey.
    const shared = layout.materialSets.find(
      (set) => ![...layout.storeyMaterials.values()].includes(set),
    )!;
    expect(parts.terrain.material).toBe(shared.slab);
  });

  it("lets only the solid massing cast shadows, and none of it take the raycast", () => {
    const { root, parts } = makeBuilding();
    const layout = buildSceneLayout(root, parseBuildingScene(root));

    expect(layout.shadowMeshes.get("st-0")).toEqual([parts["slab-0"]]);
    expect(parts["slab-0"].castShadow).toBe(true);
    expect(parts["wall-0"].castShadow).toBe(false);
    expect(parts["facade-0"].castShadow).toBe(false);
    for (const key of ["slab-0", "wall-0", "facade-0", "terrain"]) {
      expect(parts[key].raycast).not.toBe(Mesh.prototype.raycast);
    }
    // Rooms are what the pointer is for.
    expect(parts["room-0"].raycast).toBe(Mesh.prototype.raycast);
  });

  it("pitches the facade grid on the storey rise, clamped to a real module", () => {
    const { root } = makeBuilding();
    const layout = buildSceneLayout(root, parseBuildingScene(root));

    // Grounded base of each storey's own geometry.
    expect(layout.facade.get("st-0")?.baseY).toBeCloseTo(-0.15);
    expect(layout.facade.get("st-1")?.baseY).toBeCloseTo(2.85);
    // Rise to the next storey, then the top storey's own extent.
    expect(layout.facade.get("st-0")?.floorHeight).toBeCloseTo(3);
    expect(layout.facade.get("st-1")?.floorHeight).toBeCloseTo(3);
    // A 30 m footprint asks for 1.25 m panes; the explode gap follows the
    // building height.
    expect(layout.module).toBeCloseTo(1.25);
    expect(layout.gap).toBeCloseTo((6.1 / 2) * 0.55);
  });

  it("lists every material it made, so a replaced layout can be released", () => {
    const { root, parts } = makeBuilding();
    const layout = buildSceneLayout(root, parseBuildingScene(root));

    // Two rooms, and four stage materials for each of the three sets.
    expect(layout.created).toHaveLength(2 + 3 * 4);
    expect(layout.created).toContain(parts["room-0"].material);
    expect(layout.created).toContain(parts["slab-1"].material);
  });
});
