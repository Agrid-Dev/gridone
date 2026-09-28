import type { ComponentType } from "react";
import { DeviceType } from "@/lib/devices";
import { ThermostatControl, ThermostatSupervision } from "./thermostat";
import { AwhpControl, AwhpSupervision } from "./awhp";
import {
  WeatherSensorControl,
  WeatherSensorSupervision,
} from "./weather-sensor";
import { ElectricityMeterControl } from "./electricity-meter";
import { AhuDoubleFluxControl } from "./ahu-double-flux";
import { AhuSingleFluxControl } from "./ahu-single-flux";
import { AirExtractorControl } from "./air-extractor";
import {
  LiquidDetectorControl,
  LiquidDetectorFleetSummary,
} from "./liquid-detector";
import { PumpControl, PumpFleetSummary } from "./pump";
import type { StandardFleetSummaryProps, StandardControlProps } from "./types";

export type { StandardFleetSummaryProps, StandardControlProps } from "./types";

export type StandardDeviceEntry = {
  Control: ComponentType<StandardControlProps>;
  /** Full supervision-tab layout (control + companion cards). Types without
   *  one render their bare Control (see DeviceLiveControl). */
  Supervision?: ComponentType<StandardControlProps>;
  /** Lead slot on the fleet card, for types whose state is not a number and
   *  so have neither a measure nor a sparkline to show. Types without one get
   *  the numeric measure + trend (see DeviceFleetCard). */
  FleetSummary?: ComponentType<StandardFleetSummaryProps>;
};

const registry: Partial<Record<DeviceType, StandardDeviceEntry>> = {
  [DeviceType.Thermostat]: {
    Control: ThermostatControl,
    Supervision: ThermostatSupervision,
  },
  [DeviceType.Awhp]: {
    Control: AwhpControl,
    Supervision: AwhpSupervision,
  },
  [DeviceType.WeatherSensor]: {
    Control: WeatherSensorControl,
    Supervision: WeatherSensorSupervision,
  },
  [DeviceType.ElectricityMeter]: {
    Control: ElectricityMeterControl,
  },
  [DeviceType.AhuDoubleFlux]: {
    Control: AhuDoubleFluxControl,
  },
  [DeviceType.AhuSingleFlux]: {
    Control: AhuSingleFluxControl,
  },
  [DeviceType.AirExtractor]: {
    Control: AirExtractorControl,
  },
  [DeviceType.LiquidDetector]: {
    Control: LiquidDetectorControl,
    FleetSummary: LiquidDetectorFleetSummary,
  },
  [DeviceType.Pump]: {
    Control: PumpControl,
    FleetSummary: PumpFleetSummary,
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
