import type { ComponentType } from "react";
import { DeviceType } from "@/api/devices";
import { ThermostatPreview, ThermostatControl } from "./thermostat";
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

export function getStandardDeviceEntry(
  type: DeviceType | null,
): StandardDeviceEntry | undefined {
  if (!type) return undefined;
  return registry[type];
}
