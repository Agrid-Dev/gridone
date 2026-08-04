/**
 * Pure derivations for the building page, computed from the flat asset list
 * and the device list (no extra endpoint).
 *
 * Subtree membership relies on `Asset.path`: the backend maintains it as the
 * chain of ancestor ids ending with the asset's own id, so "a is under b"
 * reduces to `b.id ∈ a.path`. Devices attach to assets through their
 * `asset_id` tag (exact, non-recursive), so per-floor device counts roll up
 * the tagged asset's subtree membership.
 */
import type { Asset, AssetType, Device } from "@gridone/sdk";

export type FloorRow = {
  floor: Asset;
  zoneCount: number;
  deviceCount: number;
};

/** The leaf spaces the UI calls "zones" — structure types (org, building,
 *  floor) are not zones. */
const ZONE_TYPES: ReadonlySet<AssetType> = new Set(["room", "zone"]);

function isZone(asset: Asset): boolean {
  return ZONE_TYPES.has(asset.type);
}

/** Whether `asset` is `ancestorId` itself or one of its descendants. */
function inSubtree(asset: Asset, ancestorId: string): boolean {
  return asset.id === ancestorId || (asset.path ?? []).includes(ancestorId);
}

/** Total number of zones (room/zone assets) in the tree. */
export function countZones(assets: Asset[]): number {
  return assets.filter(isZone).length;
}

/** Name of the root org asset, or null when absent or unnamed. */
export function findOrgName(assets: Asset[]): string | null {
  const name = assets.find((a) => a.type === "org")?.name.trim();
  return name || null;
}

/**
 * One row per floor asset, in curated tree order (`position` ascending, ties
 * keeping list order). Each row counts the zones in the floor's subtree and
 * the devices whose `asset_id` tag points inside it (the floor itself
 * included). Devices with no tag, or a tag pointing at a deleted asset, are
 * ignored; zones living outside any floor appear in no row.
 */
export function buildFloorRows(assets: Asset[], devices: Device[]): FloorRow[] {
  const floors = assets
    .filter((a) => a.type === "floor")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const taggedAssetByDevice = devices
    .map((d) => d.tags?.asset_id)
    .map((id) => (id ? assetsById.get(id) : undefined));

  return floors.map((floor) => ({
    floor,
    zoneCount: assets.filter((a) => isZone(a) && inSubtree(a, floor.id)).length,
    deviceCount: taggedAssetByDevice.filter(
      (tagged) => tagged && inSubtree(tagged, floor.id),
    ).length,
  }));
}
