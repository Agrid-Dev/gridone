import type { ComponentType } from "react";
import type { Device, DeviceType } from "@/api/devices";
import { ThermostatPreview } from "./thermostat";

/** Props passed to every standard device preview (card content slot). */
export type StandardPreviewProps = {
  device: Device;
};

export type StandardDeviceEntry = {
  Preview: ComponentType<StandardPreviewProps>;
};

const registry: Record<string, StandardDeviceEntry> = {
  thermostat: { Preview: ThermostatPreview },
};

export function getStandardDeviceEntry(
  type: DeviceType | null,
): StandardDeviceEntry | undefined {
  if (!type) return undefined;
  return registry[type];
}
