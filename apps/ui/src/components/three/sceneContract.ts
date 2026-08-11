/**
 * Reader for the GLB scene contract produced by the backend conversion
 * (packages/assets/src/assets/conversion.py): root nodes carry
 * `userData.kind` — "storey" (with global_id/name/elevation/index) or
 * "unassigned" — and each storey holds a merged geometry mesh plus a
 * "spaces" group of one node per IfcSpace (`userData.global_id`).
 */
import type { Object3D } from "three";

export type SceneSpace = {
  globalId: string;
  name: string;
  object: Object3D;
};

export type SceneStorey = {
  globalId: string;
  name: string;
  elevation: number | null;
  index: number;
  object: Object3D;
  spaces: SceneSpace[];
};

export type ParsedScene = {
  storeys: SceneStorey[];
  /** Site terrain / building-level geometry that belongs to no storey. */
  unassigned: Object3D | null;
};

function collectSpaces(node: Object3D): SceneSpace[] {
  const spaces: SceneSpace[] = [];
  node.traverse((child) => {
    if (child.userData.kind === "space" && child.userData.global_id) {
      spaces.push({
        globalId: String(child.userData.global_id),
        name: String(child.userData.name ?? child.userData.global_id),
        object: child,
      });
    }
  });
  return spaces;
}

/** Splits a loaded glTF scene into its storey / space structure. */
export function parseBuildingScene(root: Object3D): ParsedScene {
  const storeys: SceneStorey[] = [];
  let unassigned: Object3D | null = null;
  for (const child of root.children) {
    if (child.userData.kind === "storey") {
      storeys.push({
        globalId: String(child.userData.global_id ?? ""),
        name: String(child.userData.name ?? ""),
        elevation:
          typeof child.userData.elevation === "number"
            ? child.userData.elevation
            : null,
        index:
          typeof child.userData.index === "number"
            ? child.userData.index
            : storeys.length,
        object: child,
        spaces: collectSpaces(child),
      });
    } else if (child.userData.kind === "unassigned") {
      unassigned = child;
    }
  }
  storeys.sort((a, b) => a.index - b.index);
  return { storeys, unassigned };
}

/** Walks up from a raycast hit to the enclosing space node, if any. */
export function findSpaceAncestor(object: Object3D | null): Object3D | null {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.kind === "space" && current.userData.global_id) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

export type GeometryCategory = "slab" | "furniture" | "structure";

/** Category of the merged-geometry node enclosing *object*, if any. */
export function findGeometryCategory(
  object: Object3D | null,
): GeometryCategory | null {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.kind === "geometry") {
      const category = current.userData.category;
      return category === "slab" || category === "furniture"
        ? category
        : "structure";
    }
    current = current.parent;
  }
  return null;
}

/**
 * Vertical gap added between storeys in the exploded view.
 *
 * Returns per-storey Y offsets: storey i is lifted by `i * gap * spread`,
 * so `spread = 0` collapses the building back to its real geometry.
 */
export function explodedOffsets(
  count: number,
  gap: number,
  spread: number,
): number[] {
  return Array.from({ length: count }, (_, index) => index * gap * spread);
}
