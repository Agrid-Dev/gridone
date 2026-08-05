import type { ComponentType } from "react";
import { DeviceType } from "@/lib/devices";
import {
  ThermostatPreview,
  ThermostatControl,
  ThermostatSupervision,
} from "./thermostat";
import { AwhpPreview, AwhpControl } from "./awhp";
import { WeatherSensorPreview, WeatherSensorControl } from "./weather-sensor";
import {
  ElectricityMeterPreview,
  ElectricityMeterControl,
} from "./electricity-meter";
import { AhuDoubleFluxPreview, AhuDoubleFluxControl } from "./ahu-double-flux";
import { AhuSingleFluxPreview, AhuSingleFluxControl } from "./ahu-single-flux";
import { AirExtractorPreview, AirExtractorControl } from "./air-extractor";
import type { StandardPreviewProps, StandardControlProps } from "./types";

export type { StandardPreviewProps, StandardControlProps } from "./types";

export type StandardDeviceEntry = {
  Preview: ComponentType<StandardPreviewProps>;
  Control: ComponentType<StandardControlProps>;
  /** Full supervision-tab layout (control + companion cards). Types without
   *  one render their bare Control (see DeviceLiveControl). */
  Supervision?: ComponentType<StandardControlProps>;
};

const registry: Partial<Record<DeviceType, StandardDeviceEntry>> = {
  [DeviceType.Thermostat]: {
    Preview: ThermostatPreview,
    Control: ThermostatControl,
    Supervision: ThermostatSupervision,
  },
  [DeviceType.Awhp]: {
    Preview: AwhpPreview,
    Control: AwhpControl,
  },
  [DeviceType.WeatherSensor]: {
    Preview: WeatherSensorPreview,
    Control: WeatherSensorControl,
  },
  [DeviceType.ElectricityMeter]: {
    Preview: ElectricityMeterPreview,
    Control: ElectricityMeterControl,
  },
  [DeviceType.AhuDoubleFlux]: {
    Preview: AhuDoubleFluxPreview,
    Control: AhuDoubleFluxControl,
  },
  [DeviceType.AhuSingleFlux]: {
    Preview: AhuSingleFluxPreview,
    Control: AhuSingleFluxControl,
  },
  [DeviceType.AirExtractor]: {
    Preview: AirExtractorPreview,
    Control: AirExtractorControl,
  },
};

/** The device types a standard control is registered for — what a surface
 *  that can only render standard controls (e.g. the device control widget)
 *  offers to pick from. */
export function standardControlTypes(): DeviceType[] {
  return Object.keys(registry) as DeviceType[];
}

export function getStandardDeviceEntry(
  type: string | null | undefined,
): StandardDeviceEntry | undefined {
  if (!type) return undefined;
  return registry[type as DeviceType];
}
