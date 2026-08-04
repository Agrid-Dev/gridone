/**
 * Asset domain helpers over the SDK wire types.
 *
 * The SDK leaves tree nodes untyped (their shape is deployment-defined), so
 * the typed `AssetTreeNode` view plus the flatten helpers live here.
 */
import type { Asset, AssetType } from "@gridone/sdk";

export const ASSET_TYPES = [
  "org",
  "building",
  "floor",
  "room",
  "zone",
] as const satisfies readonly AssetType[];

/** Device reference embedded in `tree-with-devices` nodes. */
export type DeviceRef = {
  id: string;
  name: string;
};

/** Typed view of the nodes returned by `client.assets.getTree*()`. */
export type AssetTreeNode = Asset & {
  children: AssetTreeNode[];
  devices?: DeviceRef[];
};

/** Walks the asset tree and returns a flat, name-sorted ``Asset`` list —
 *  the shape resource pickers (asset selectors, target filters) consume. */
export function flattenAssetTree(tree: AssetTreeNode[]): Asset[] {
  const out: Asset[] = [];
  const walk = (nodes: AssetTreeNode[]) => {
    for (const node of nodes) {
      out.push(toAsset(node));
      walk(node.children);
    }
  };
  walk(tree);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Same walk as ``flattenAssetTree`` but keyed by id — the shape presenters
 *  (e.g. ``TargetPresenter``) use to translate opaque ``assetId`` references
 *  into readable names. */
export function flattenAssetTreeById(
  tree: AssetTreeNode[],
): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  const walk = (nodes: AssetTreeNode[]) => {
    for (const node of nodes) {
      out[node.id] = toAsset(node);
      walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/** "Building A › Floor 1" — the asset's ancestor names, itself excluded.
 *
 *  `path` is a materialized list of ancestor ids ending with the asset's own,
 *  so the last entry is dropped. Ids missing from `assetsById` are skipped
 *  rather than rendered as `undefined` — a partially loaded tree degrades to a
 *  shorter path instead of a broken label.
 *
 *  Shared by the asset picker and the topbar zone search so both label a zone
 *  the same way. */
export function ancestorPathOf(
  asset: Asset,
  assetsById: Record<string, Asset>,
): string {
  return (asset.path ?? [])
    .slice(0, -1)
    .map((ancestorId) => assetsById[ancestorId]?.name)
    .filter(Boolean)
    .join(" › ");
}

function toAsset(node: AssetTreeNode): Asset {
  return {
    id: node.id,
    parent_id: node.parent_id,
    type: node.type,
    name: node.name,
    path: node.path,
    position: node.position,
  };
}
