/**
 * Joins the 3D spaces of the building model with the asset tree and the live
 * device list: space → room asset (via `ifc_global_id`) → linked devices →
 * temperature reading and worst active fault severity.
 */
import type { Asset, Device, ModelSpace } from "@gridone/sdk";
import { deviceMeasureReading } from "@/lib/deviceSummary";
import {
  getConnectionStatus,
  isThermostat,
  type ConnectionStatus,
} from "@/lib/devices";
import { getHighestActiveSeverity } from "@/lib/faults";
import { mostSevere, type Severity } from "@/lib/severity";
import type { SceneStorey } from "./sceneContract";

export type RoomState = {
  globalId: string;
  /** Linked room asset, if any — null renders as "no data". */
  assetId: string | null;
  name: string;
  temperature: number | null;
  severity: Severity | null;
  /** IFC classification hint (e.g. "Chambre Twin"), for the "function" colour
   * mode and the room panel. Never the AGR-1129 usage field. */
  objectType: string | null;
  /** Worst connection state across the room's devices, for the "connectivity"
   * colour mode. Null when no device reports one. */
  connection: ConnectionStatus | null;
  devices: Device[];
};

/** Ordered worst-first so a single bad device colours the whole room. */
const CONNECTION_RANK: Record<ConnectionStatus, number> = {
  error: 3,
  degraded: 2,
  ok: 1,
  idle: 0,
};

function worstConnection(devices: Device[]): ConnectionStatus | null {
  let worst: ConnectionStatus | null = null;
  for (const device of devices) {
    const status = getConnectionStatus(device);
    if (
      status &&
      (worst === null || CONNECTION_RANK[status] > CONNECTION_RANK[worst])
    ) {
      worst = status;
    }
  }
  return worst;
}

/** Occupancy reported by any device in the room, or null when none does. */
export function roomOccupancy(state: RoomState): boolean | null {
  for (const device of state.devices) {
    const value = device.attributes?.["occupancy"]?.current_value;
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

/** Panels lit on a storey with no occupancy data — enough to look alive. */
export const DEFAULT_LIT_SHARE = 0.42;
/** Floor of the lit share once occupancy is known: an empty floor still shows
 * a few lights, the way a real building never goes fully dark. */
const MIN_LIT_SHARE = 0.12;

/**
 * Share of each storey's facade panels to light, from how many of its rooms
 * are occupied — the facade is the dashboard. Rooms without occupancy data do
 * not count; a storey with none at all reads as alive at the default share.
 */
export function storeyLitShares(
  storeys: SceneStorey[],
  roomStates: Map<string, RoomState>,
): Map<string, number> {
  const shares = new Map<string, number>();
  for (const storey of storeys) {
    let known = 0;
    let occupied = 0;
    for (const space of storey.spaces) {
      const state = roomStates.get(space.globalId);
      const value = state ? roomOccupancy(state) : null;
      if (value !== null) {
        known += 1;
        occupied += value ? 1 : 0;
      }
    }
    shares.set(
      storey.globalId,
      known > 0 ? Math.max(MIN_LIT_SHARE, occupied / known) : DEFAULT_LIT_SHARE,
    );
  }
  return shares;
}

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
      objectType: space.object_type ?? null,
      connection: worstConnection(roomDevices),
      devices: roomDevices,
    });
  }
  return states;
}
