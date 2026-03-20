import type { ComponentType } from "react";
import { DeviceType } from "@/api/devices";
import { ThermostatPreview, ThermostatControl } from "./thermostat";
import { AwhpPreview, AwhpControl } from "./awhp";
import type { StandardPreviewProps, StandardControlProps } from "./types";

export type { StandardPreviewProps, StandardControlProps } from "./types";

export type StandardDeviceEntry = {
  Preview: ComponentType<StandardPreviewProps>;
  Control: ComponentType<StandardControlProps>;
};

const registry: Partial<Record<DeviceType, StandardDeviceEntry>> = {
  [DeviceType.Thermostat]: {
    Preview: ThermostatPreview,
    Control: ThermostatControl,
  },
  [DeviceType.Awhp]: {
    Preview: AwhpPreview,
    Control: AwhpControl,
  },
};

export function getStandardDeviceEntry(
  type: DeviceType | null,
): StandardDeviceEntry | undefined {
  if (!type) return undefined;
  return registry[type];
}
