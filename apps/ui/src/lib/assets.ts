/**
 * Asset domain helpers over the SDK wire types.
 *
 * The SDK leaves tree nodes untyped (their shape is deployment-defined), so
 * the typed `AssetTreeNode` view plus the flatten helpers live here.
 */
import type { Asset, AssetType, AssetUsage } from "@gridone/sdk";
import { sortedByName } from "@/lib/sortByName";

export const ASSET_TYPES = [
  "org",
  "building",
  "floor",
  "room",
  "zone",
] as const satisfies readonly AssetType[];

/** What a room or zone is used for, in display order. Mirrors the backend
 *  `AssetUsage` enum; `null` on an asset means "not classified yet". */
export const ASSET_USAGES = [
  "hotel_room",
  "common_area",
  "restaurant",
  "technical_zone",
  "office",
  "meeting_room",
  "open_space",
  "other",
] as const satisfies readonly AssetUsage[];

/** Hierarchy levels that may carry a usage — mirrors the backend guard. */
const USAGE_CAPABLE_TYPES: ReadonlySet<AssetType> = new Set<AssetType>([
  "room",
  "zone",
]);

export function canCarryUsage(type: AssetType): boolean {
  return USAGE_CAPABLE_TYPES.has(type);
}

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

/** Device id → the asset it hangs off, walked from a `tree-with-devices`
 *  tree. `devices` lists the devices tagged to that exact node (attachment is
 *  not recursive), so the owning node is recorded as-is. Devices attached to
 *  no asset are simply absent, letting callers render their own placeholder. */
export function flattenDeviceAssets(
  tree: AssetTreeNode[],
): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  const walk = (nodes: AssetTreeNode[]) => {
    for (const node of nodes) {
      const asset = toAsset(node);
      for (const device of node.devices ?? []) out[device.id] = asset;
      walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/** Ids of every room and zone in `node`'s subtree, `node` itself included
 *  when it can carry a usage — what a tree checkbox stands for. Ticking a
 *  floor selects the rooms beneath it; the floor id itself is never listed,
 *  so a batch classification only ever receives ids the API accepts. */
export function usageCapableIdsUnder(node: AssetTreeNode): string[] {
  const out: string[] = [];
  const walk = (current: AssetTreeNode) => {
    if (canCarryUsage(current.type)) out.push(current.id);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return out;
}

/** How much of a checkbox's id set is currently selected. */
export type SelectionState = "none" | "some" | "all";

/** Tri-state of a select-all checkbox standing for `ids`: `all` when every id
 *  is selected, `some` for a partial selection (rendered indeterminate), and
 *  `none` otherwise — an empty `ids` is `none`, there is nothing to tick. */
export function selectionStateOf(
  ids: readonly string[],
  selected: ReadonlySet<string>,
): SelectionState {
  const hits = ids.filter((id) => selected.has(id)).length;
  if (hits === 0) return "none";
  return hits === ids.length ? "all" : "some";
}

/** Non-mutating sort in curated tree order: `position` ascending with name as
 *  tiebreaker — the same ordering the server applies to tree children. Use it
 *  wherever siblings render, so manual reordering is reflected everywhere. */
export function sortedByPosition<T extends Pick<Asset, "name" | "position">>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      (a.position ?? 0) - (b.position ?? 0) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** Resolves a list of asset ids to their assets, name-sorted, dropping any id
 *  missing from `assetsById` (a partially loaded tree, or a stale id). Used by
 *  `ZoneOverridesField` to build its add/copy pickers' shared candidate list
 *  once, rather than each picker re-resolving the same ids. */
export function sortedAssetsOf(
  assetIds: readonly string[],
  assetsById: Record<string, Asset>,
): Asset[] {
  return sortedByName(
    assetIds
      .map((assetId) => assetsById[assetId])
      .filter((asset): asset is Asset => asset !== undefined),
  );
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

/** Assets that place a device inside the building, from the top down. `org`
 *  and `building` are excluded: a single-building deployment repeats them on
 *  every device, which reads as noise rather than as a location. */
const ZONE_PATH_TYPES = new Set<AssetType>(["floor", "room", "zone"]);

/** "Floor 2 · Room 201" — where a device sits, the asset itself included.
 *
 *  Same materialized `path` as {@link ancestorPathOf}, kept whole and then
 *  narrowed to the zone-level ancestors; ids missing from `assetsById` are
 *  skipped so a partially loaded tree degrades to a shorter label. */
export function zonePathOf(
  asset: Asset,
  assetsById: Record<string, Asset>,
): string {
  const chain = asset.path?.length ? asset.path : [asset.id];
  return chain
    .map((id) => assetsById[id])
    .filter((node) => node && ZONE_PATH_TYPES.has(node.type))
    .map((node) => node.name)
    .join(" · ");
}

function toAsset(node: AssetTreeNode): Asset {
  return {
    id: node.id,
    parent_id: node.parent_id,
    type: node.type,
    name: node.name,
    path: node.path,
    position: node.position,
    usage: node.usage,
  };
}
