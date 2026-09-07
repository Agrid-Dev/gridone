/**
 * Search over what the viewer can act on: the building's zones, the devices
 * linked to them, and the devices the model cannot place.
 *
 * A device has no position in the scene — markers are one sphere per room
 * (`spaceMaterials.markerOf`) — so a device hit resolves to the *room* it is
 * linked to, and the viewer flies there. Devices whose asset is not a space of
 * the model (linked to a floor, the building, or nothing) cannot be flown to
 * at all; they are kept apart so the panel can link out instead of dead-clicking.
 */
import type { Device } from "@gridone/sdk";
import {
  indexRoomsByAsset,
  type LevelSummary,
  type RoomLocation,
  type ZoneSummary,
} from "./levelSummaries";
import type { RoomState } from "./roomStates";

export type ZoneHit = { zone: ZoneSummary; levelName: string };

/** A device matched by the query, and the room the viewer flies to for it. */
export type DeviceHit = RoomLocation & { device: Device };

export type SearchResults = {
  zones: ZoneHit[];
  devices: DeviceHit[];
  /** Matching devices the model cannot place, sorted by name. */
  offModel: Device[];
  /** Matches dropped by the per-group cap, summed across the three groups. */
  overflow: number;
};

/** Rows kept per group: enough to scan, few enough to keep the rail usable. */
export const GROUP_LIMIT = 40;

/** Cap a group, reporting what it dropped. */
function capped<T>(rows: T[]): { rows: T[]; overflow: number } {
  return rows.length <= GROUP_LIMIT
    ? { rows, overflow: 0 }
    : { rows: rows.slice(0, GROUP_LIMIT), overflow: rows.length - GROUP_LIMIT };
}

/**
 * Zones and devices matching `query`, case-insensitively, by substring.
 *
 * Devices match on name, id and raw type (`"thermostat"`), never on their
 * attribute names — "temperature" would otherwise match the whole fleet.
 * An empty query returns null, which the panel reads as "not searching".
 */
export function searchViewer({
  levels,
  roomStates,
  devices,
  query,
}: {
  levels: LevelSummary[];
  roomStates: Map<string, RoomState>;
  devices: Device[];
  query: string;
}): SearchResults | null {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return null;
  }

  const zoneHits: ZoneHit[] = [];
  for (const level of levels) {
    for (const zone of level.zones) {
      const haystack = `${zone.name} ${zone.objectType ?? ""}`.toLowerCase();
      if (haystack.includes(needle)) {
        zoneHits.push({ zone, levelName: level.name });
      }
    }
  }

  const rooms = indexRoomsByAsset(roomStates, levels);
  const deviceHits: DeviceHit[] = [];
  const offModel: Device[] = [];
  for (const device of devices) {
    const haystack =
      `${device.name ?? ""} ${device.id} ${device.type ?? ""}`.toLowerCase();
    if (!haystack.includes(needle)) {
      continue;
    }
    const assetId = device.tags?.asset_id;
    const room = assetId ? rooms.get(assetId) : undefined;
    if (room) {
      deviceHits.push({ device, ...room });
    } else {
      offModel.push(device);
    }
  }

  const byName = (a: Device, b: Device) =>
    (a.name || a.id).localeCompare(b.name || b.id);
  deviceHits.sort((a, b) => byName(a.device, b.device));
  offModel.sort(byName);

  const zones = capped(zoneHits);
  const placed = capped(deviceHits);
  const unplaced = capped(offModel);
  return {
    zones: zones.rows,
    devices: placed.rows,
    offModel: unplaced.rows,
    overflow: zones.overflow + placed.overflow + unplaced.overflow,
  };
}

/** True when a search ran and matched nothing at all. */
export function isEmptyResult(results: SearchResults | null): boolean {
  return (
    results !== null &&
    results.zones.length === 0 &&
    results.devices.length === 0 &&
    results.offModel.length === 0
  );
}
