import type { Device } from "@gridone/sdk";
import { useAssetTree } from "@/hooks/useAssetTree";
import { zonePathOf } from "@/lib/assets";

/** Full placement of a device ("Floor 2 · Room 201") — the device card
 *  subtitle, which has the room to carry the whole chain. Returns a lookup so
 *  a grid of cards shares one asset-tree subscription. */
export function useDeviceZonePath(): (device: Device) => string | null {
  const { assetsById } = useAssetTree();

  return (device) => {
    const assetId = device.tags?.["asset_id"]?.[0];
    const asset = assetId ? assetsById[assetId] : undefined;
    if (!asset) return null;
    // An asset outside the floor/room/zone chain (a device tagged straight to
    // the building) still deserves a label: fall back to its own name.
    return zonePathOf(asset, assetsById) || asset.name;
  };
}
