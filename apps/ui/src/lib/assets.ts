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
