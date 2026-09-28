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
import { PmsMonitorFleetSummary } from "./pms-monitor";
import { ReadingFleetSummary } from "./ReadingFleetSummary";
import type { StandardFleetSummaryProps, StandardControlProps } from "./types";

export type { StandardFleetSummaryProps, StandardControlProps } from "./types";

export type StandardDeviceEntry = {
  /** The type's standard control; null for a read-only type, which the device
   *  page shows through its attribute panes alone. */
  Control: ComponentType<StandardControlProps> | null;
  /** Full supervision-tab layout (control + companion cards). Types without
   *  one render their bare Control (see DeviceLiveControl). */
  Supervision?: ComponentType<StandardControlProps>;
  /** Lead slot on the fleet card (see DeviceFleetCard). */
  FleetSummary: ComponentType<StandardFleetSummaryProps>;
};

const registry: Partial<Record<DeviceType, StandardDeviceEntry>> = {
  [DeviceType.Thermostat]: {
    Control: ThermostatControl,
    Supervision: ThermostatSupervision,
    FleetSummary: ReadingFleetSummary,
  },
  [DeviceType.Awhp]: {
    Control: AwhpControl,
    Supervision: AwhpSupervision,
    FleetSummary: ReadingFleetSummary,
  },
  [DeviceType.WeatherSensor]: {
    Control: WeatherSensorControl,
    Supervision: WeatherSensorSupervision,
    FleetSummary: ReadingFleetSummary,
  },
  [DeviceType.ElectricityMeter]: {
    Control: ElectricityMeterControl,
    FleetSummary: ReadingFleetSummary,
  },
  [DeviceType.AhuDoubleFlux]: {
    Control: AhuDoubleFluxControl,
    FleetSummary: ReadingFleetSummary,
  },
  [DeviceType.AhuSingleFlux]: {
    Control: AhuSingleFluxControl,
    FleetSummary: ReadingFleetSummary,
  },
  [DeviceType.AirExtractor]: {
    Control: AirExtractorControl,
    FleetSummary: ReadingFleetSummary,
  },
  [DeviceType.PmsMonitor]: {
    Control: null,
    FleetSummary: PmsMonitorFleetSummary,
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
  return (Object.keys(registry) as DeviceType[]).filter(
    (type) => registry[type]?.Control,
  );
}

export function getStandardDeviceEntry(
  type: string | null | undefined,
): StandardDeviceEntry | undefined {
  if (!type) return undefined;
  return registry[type as DeviceType];
}

/** The fleet card lead slot for `type`: its registered summary, or the numeric
 *  reading for a device of no registered type. */
export function getFleetSummary(
  type: string | null | undefined,
): ComponentType<StandardFleetSummaryProps> {
  return getStandardDeviceEntry(type)?.FleetSummary ?? ReadingFleetSummary;
}
