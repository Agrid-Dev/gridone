/**
 * Dresses a loaded building scene for the viewer and measures it. Every mesh
 * gets fresh materials — one stage set per storey so a level can fade on its
 * own, a unique fill and outline per room so each can be coloured alone — and
 * the bounds the camera fit, the facade grid and the plan are derived once.
 * React-free: it runs in a memo, once per scene, and can be exercised on a
 * synthetic scene graph.
 */
import {
  Box3,
  Mesh,
  Vector3,
  type Group,
  type MeshStandardMaterial,
  type Object3D,
} from "three";
import {
  findGeometryCategory,
  findSpaceAncestor,
  type ParsedScene,
  type SceneStorey,
} from "./sceneContract";
import { edgesOf, makeSpaceMaterial } from "./spaceMaterials";
import {
  makeCategoryMaterials,
  type CategoryMaterials,
} from "./stageMaterials";

/** Vertical anchoring of one storey's facade grid. */
export type FacadeParams = {
  /** World Y the grid starts from, without the explode offset. */
  baseY: number;
  /** Storey height in metres — the vertical pitch of the grid. */
  floorHeight: number;
};

export type SceneLayout = {
  /** Space volume mesh, by space global id. */
  spaceMeshes: Map<string, Mesh>;
  /** Stage material set, by storey global id. */
  storeyMaterials: Map<string, CategoryMaterials>;
  /** Every stage set: the storeys' and the shared one of unassigned geometry. */
  materialSets: CategoryMaterials[];
  /** Every material this layout created, to release once it is replaced. */
  created: MeshStandardMaterial[];
  /** Shadow-casting meshes, by storey global id. */
  shadowMeshes: Map<string, Mesh[]>;
  /** Facade grid anchoring, by storey global id. */
  facade: Map<string, FacadeParams>;
  /** Grounded bounds of each storey, by global id — what the plan frames. */
  storeyBoxes: Map<string, Box3>;
  /** Bounds of the whole grounded building. */
  bounds: Box3;
  size: Vector3;
  center: Vector3;
  minY: number;
  /** Horizontal pitch of the facade grid, in metres. */
  module: number;
  /** Vertical gap between storeys in the exploded view, in metres. */
  gap: number;
};

/** Smallest storey height the facade grid is pitched on, in metres. */
const MIN_FLOOR_HEIGHT = 2;
/** Smallest explode gap, in metres. */
const MIN_GAP = 1.2;
/** Plausible curtain-wall module range, in metres. */
const MODULE_RANGE = { min: 1.2, max: 2.2 };

type Dressed = {
  spaceMeshes: Map<string, Mesh>;
  created: MeshStandardMaterial[];
};

/**
 * Dresses every mesh under `root`: rooms get their own fill and outline, the
 * massing goes on its storey's stage set. Only the solid massing throws
 * shadows — the glass envelope and the near-invisible structure would shade
 * the scene from surfaces the eye reads as absent — and none of it takes the
 * raycast: walls and slabs are mostly transparent, so they must not swallow
 * the hover and click meant for the rooms behind them.
 */
function dress(
  root: Object3D,
  materials: CategoryMaterials,
  into: Dressed,
  casters?: Mesh[],
): void {
  root.traverse((child) => {
    // The viewer's own outlines and markers hang off the space volumes and
    // survive in the cached scene graph. Re-dressing a marker would hand
    // `spaceMeshes` the marker sphere instead of the room it flags — traversal
    // is parent-first, so the child would win.
    if (!(child instanceof Mesh) || child.userData.viewerDecoration) {
      return;
    }
    const spaceNode = findSpaceAncestor(child);
    if (spaceNode) {
      const material = makeSpaceMaterial();
      child.material = material;
      into.created.push(material);
      edgesOf(child);
      into.spaceMeshes.set(String(spaceNode.userData.global_id), child);
      return;
    }
    const category = findGeometryCategory(child) ?? "structure";
    child.material = materials[category];
    child.raycast = () => {};
    if (category === "slab" || category === "furniture") {
      child.castShadow = true;
      child.receiveShadow = true;
      casters?.push(child);
    }
  });
}

/**
 * Storey height for the facade grid: the rise to the next storey when both
 * elevations are known, the storey's own extent otherwise.
 */
function storeyRise(
  storey: SceneStorey,
  next: SceneStorey | undefined,
  box: Box3,
): number {
  return storey.elevation != null && next?.elevation != null
    ? next.elevation - storey.elevation
    : box.max.y - box.min.y;
}

/**
 * Window pitch: a fixed metre value would look wrong on a building of a
 * different scale, so derive it from the footprint and clamp to a plausible
 * curtain-wall module.
 */
function facadeModule(size: Vector3): number {
  const derived = Math.max(size.x, size.z) / 24;
  return Math.min(MODULE_RANGE.max, Math.max(MODULE_RANGE.min, derived));
}

export function buildSceneLayout(
  scene: Group,
  parsed: ParsedScene,
): SceneLayout {
  const dressed: Dressed = { spaceMeshes: new Map(), created: [] };
  const storeyMaterials = new Map<string, CategoryMaterials>();
  const materialSets: CategoryMaterials[] = [];
  const shadowMeshes = new Map<string, Mesh[]>();

  for (const storey of parsed.storeys) {
    // The scene graph is cached across mounts with whatever explode offset
    // was last eased in — measuring it as-is would frame an exploded
    // building. Ground every storey first; spread re-eases from zero.
    storey.object.position.y = 0;
    const materials = makeCategoryMaterials();
    storeyMaterials.set(storey.globalId, materials);
    materialSets.push(materials);
    const casters: Mesh[] = [];
    dress(storey.object, materials, dressed, casters);
    shadowMeshes.set(storey.globalId, casters);
  }
  // Site terrain and anything outside the storey structure shares one set.
  const sharedMaterials = makeCategoryMaterials();
  materialSets.push(sharedMaterials);
  for (const child of scene.children) {
    if (child.userData.kind !== "storey") {
      dress(child, sharedMaterials, dressed);
    }
  }
  const created = [
    ...dressed.created,
    ...materialSets.flatMap((set) => Object.values(set)),
  ];

  const bounds = new Box3().setFromObject(scene);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const storeyCount = Math.max(1, parsed.storeys.length);
  const gap = Math.max(MIN_GAP, (size.y / storeyCount) * 0.55);

  const facade = new Map<string, FacadeParams>();
  const storeyBoxes = new Map<string, Box3>();
  parsed.storeys.forEach((storey, index) => {
    // Grounded bounds (every storey was zeroed above): what the plan frames,
    // since entering it collapses the explode first — and, for the facade,
    // an anchor the grid stays locked to while the storey travels.
    const box = new Box3().setFromObject(storey.object);
    storeyBoxes.set(storey.globalId, box);
    facade.set(storey.globalId, {
      baseY: box.min.y,
      floorHeight: Math.max(
        MIN_FLOOR_HEIGHT,
        storeyRise(storey, parsed.storeys[index + 1], box),
      ),
    });
  });

  return {
    spaceMeshes: dressed.spaceMeshes,
    storeyMaterials,
    materialSets,
    created,
    shadowMeshes,
    facade,
    storeyBoxes,
    bounds,
    size,
    center,
    minY: bounds.min.y,
    module: facadeModule(size),
    gap,
  };
}
