import type { ComponentType } from "react";
import type { Device, DeviceType } from "@/api/devices";
import type { Feedback } from "@/hooks/useDeviceDetails";
import { ThermostatPreview, ThermostatControl } from "./thermostat";

/** Props passed to every standard device preview (card content slot). */
export type StandardPreviewProps = {
  device: Device;
};

/** Props passed to every standard device control (detail view). */
export type StandardControlProps = {
  device: Device;
  draft: Record<string, string | number | boolean | null>;
  savingAttr: string | null;
  feedback: Feedback | null;
  onDraftChange: (
    name: string,
    value: string | number | boolean | null,
  ) => void;
  onSave: (name: string) => void;
};

export type StandardDeviceEntry = {
  Preview: ComponentType<StandardPreviewProps>;
  Control: ComponentType<StandardControlProps>;
};

const registry: Record<string, StandardDeviceEntry> = {
  thermostat: { Preview: ThermostatPreview, Control: ThermostatControl },
};

export function getStandardDeviceEntry(
  type: DeviceType | null,
): StandardDeviceEntry | undefined {
  if (!type) return undefined;
  return registry[type];
}
