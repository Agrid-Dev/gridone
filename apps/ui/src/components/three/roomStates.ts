/**
 * Joins the 3D spaces of the building model with the asset tree and the live
 * device list: space → room asset (via `ifc_global_id`) → linked devices →
 * temperature reading and worst active fault severity.
 */
import type { Asset, Device, ModelSpace } from "@gridone/sdk";
import { deviceMeasureReading } from "@/lib/deviceSummary";
import { isThermostat } from "@/lib/devices";
import { getHighestActiveSeverity } from "@/lib/faults";
import { mostSevere, type Severity } from "@/lib/severity";

export type RoomState = {
  globalId: string;
  /** Linked room asset, if any — null renders as "no data". */
  assetId: string | null;
  name: string;
  temperature: number | null;
  severity: Severity | null;
  devices: Device[];
};

export function buildRoomStates(
  spaces: ModelSpace[],
  assets: Asset[],
  devices: Device[],
): Map<string, RoomState> {
  const assetByGlobalId = new Map<string, Asset>();
  for (const asset of assets) {
    if (asset.ifc_global_id) {
      assetByGlobalId.set(asset.ifc_global_id, asset);
    }
  }
  const devicesByAssetId = new Map<string, Device[]>();
  for (const device of devices) {
    const assetId = device.tags?.asset_id;
    if (assetId) {
      const bucket = devicesByAssetId.get(assetId);
      if (bucket) {
        bucket.push(device);
      } else {
        devicesByAssetId.set(assetId, [device]);
      }
    }
  }

  const states = new Map<string, RoomState>();
  for (const space of spaces) {
    const asset = assetByGlobalId.get(space.global_id);
    const roomDevices = asset ? (devicesByAssetId.get(asset.id) ?? []) : [];
    const thermostat = roomDevices.find(isThermostat);
    const temperature = thermostat
      ? (deviceMeasureReading(thermostat)?.value ?? null)
      : null;
    const severities = roomDevices
      .map(getHighestActiveSeverity)
      .filter((severity): severity is Severity => severity !== null);
    states.set(space.global_id, {
      globalId: space.global_id,
      assetId: asset?.id ?? null,
      name: asset?.name ?? space.name,
      temperature,
      severity: mostSevere(severities),
      devices: roomDevices,
    });
  }
  return states;
}
