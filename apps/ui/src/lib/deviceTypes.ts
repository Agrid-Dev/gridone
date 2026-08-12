/**
 * Device-type presentation helpers shared by the fleet views (devices table
 * and filter chips, home tiles, type chips): icons, catalog labels and
 * per-type bucketing. Devices with no type or an unknown one fall under the
 * `other` bucket.
 */
import type { ComponentType } from "react";
import {
  AirVent,
  BedDouble,
  CircleHelp,
  CloudSun,
  Cpu,
  Fan,
  Thermometer,
  Wind,
  Zap,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { Device } from "@gridone/sdk";
import { DeviceType } from "@/lib/devices";
import { sortedByName } from "@/lib/sortByName";

export type DeviceTypeIcon = ComponentType<{ className?: string }>;

export const DEVICE_TYPE_ICONS: Record<DeviceType, DeviceTypeIcon> = {
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Awhp]: Fan,
  [DeviceType.WeatherSensor]: CloudSun,
  [DeviceType.ElectricityMeter]: Zap,
  [DeviceType.AhuDoubleFlux]: AirVent,
  [DeviceType.AhuSingleFlux]: AirVent,
  [DeviceType.AirExtractor]: Wind,
  [DeviceType.PmsMonitor]: BedDouble,
};

export const OTHER_KEY = "other";

/** A standard device type, or `other` for untyped/unknown devices. */
export type DeviceTypeKey = DeviceType | typeof OTHER_KEY;

const KNOWN_DEVICE_TYPES = new Set<string>(Object.values(DeviceType));

/** Bucket key for a device: its standard type, or `other`. */
export function deviceTypeKey(device: Device): DeviceTypeKey {
  return device.type && KNOWN_DEVICE_TYPES.has(device.type)
    ? (device.type as DeviceType)
    : OTHER_KEY;
}

/** Icon for a raw device type: null when unset, a fallback when unknown. */
export function deviceTypeIcon(
  type: DeviceType | string | null | undefined,
): DeviceTypeIcon | null {
  if (!type) return null;
  return DEVICE_TYPE_ICONS[type as DeviceType] ?? CircleHelp;
}

/** Icon for a bucket key — `other` gets its own icon, never the fallback. */
export function deviceTypeKeyIcon(key: DeviceTypeKey): DeviceTypeIcon {
  return key === OTHER_KEY ? Cpu : DEVICE_TYPE_ICONS[key];
}

/** Canonical display order of the type buckets (`other` last). */
export const DEVICE_TYPE_ORDER: readonly DeviceTypeKey[] = [
  DeviceType.Thermostat,
  DeviceType.Awhp,
  DeviceType.AhuDoubleFlux,
  DeviceType.AhuSingleFlux,
  DeviceType.ElectricityMeter,
  DeviceType.WeatherSensor,
  DeviceType.AirExtractor,
  DeviceType.PmsMonitor,
  OTHER_KEY,
];

/** Device count per bucket key; buckets with no devices are absent. */
export function countDevicesByType(
  devices: readonly Device[],
): Map<DeviceTypeKey, number> {
  const counts = new Map<DeviceTypeKey, number>();
  for (const device of devices) {
    const key = deviceTypeKey(device);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export type DeviceTypeGroup = { key: DeviceTypeKey; devices: Device[] };

/** Buckets in {@link DEVICE_TYPE_ORDER}, empty buckets omitted, devices
 *  sorted by name within each bucket. */
export function groupDevicesByType(
  devices: readonly Device[],
): DeviceTypeGroup[] {
  const buckets = new Map<DeviceTypeKey, Device[]>();
  for (const device of devices) {
    const key = deviceTypeKey(device);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(device);
    else buckets.set(key, [device]);
  }
  return DEVICE_TYPE_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    devices: sortedByName(buckets.get(key) ?? []),
  }));
}

/** Singular/plural bucket label from the `standardDevices` catalog. */
export function deviceTypeLabel(
  key: DeviceTypeKey,
  count: number,
  t: TFunction<"standardDevices">,
): string {
  const form = count === 1 ? "name" : "name_plural";
  return t(`${key}.${form}`);
}

/** Singular name of a raw device type, from the same `standardDevices`
 *  catalog the fleet views use — one vocabulary across devices, drivers,
 *  commands and zones (AGR-1029). A type the catalog doesn't know falls back
 *  to the raw wire value rather than an empty label; an unset type yields
 *  undefined so callers can render their own placeholder. */
export function deviceTypeName(
  type: DeviceType | string | null | undefined,
  t: TFunction<"standardDevices">,
): string | undefined {
  if (!type) return undefined;
  return KNOWN_DEVICE_TYPES.has(type) ? t(`${type as DeviceType}.name`) : type;
}

/** Bucket display name for filter chips and table group headers — always the
 *  plural catalog form: it names the category, not a quantity, and sits next
 *  to a separate count ("Thermostats · 1"). */
export function deviceTypeBucketLabel(
  key: DeviceTypeKey,
  t: TFunction<"standardDevices">,
): string {
  return t(`${key}.name_plural`);
}
