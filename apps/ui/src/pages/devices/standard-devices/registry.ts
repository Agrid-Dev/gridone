import type { ComponentType } from "react";
import { DeviceType } from "@/lib/devices";
import {
  ThermostatControl,
  ThermostatSupervision,
  thermostatFleetLead,
  thermostatFleetStatus,
} from "./thermostat";
import {
  AwhpControl,
  AwhpSupervision,
  awhpFleetLead,
  awhpFleetStatus,
} from "./awhp";
import {
  WeatherSensorControl,
  WeatherSensorSupervision,
  weatherSensorFleetLead,
  weatherSensorFleetStatus,
} from "./weather-sensor";
import {
  ElectricityMeterControl,
  electricityMeterFleetLead,
  electricityMeterFleetStatus,
} from "./electricity-meter";
import {
  AhuDoubleFluxControl,
  ahuDoubleFluxFleetLead,
  ahuDoubleFluxFleetStatus,
} from "./ahu-double-flux";
import {
  AhuSingleFluxControl,
  ahuSingleFluxFleetLead,
  ahuSingleFluxFleetStatus,
} from "./ahu-single-flux";
import {
  AirExtractorControl,
  airExtractorFleetLead,
  airExtractorFleetStatus,
} from "./air-extractor";
import {
  LiquidDetectorControl,
  liquidDetectorFleetLead,
  liquidDetectorFleetStatus,
} from "./liquid-detector";
import { PumpControl, pumpFleetLead, pumpFleetStatus } from "./pump";
import { pmsMonitorFleetLead, pmsMonitorFleetStatus } from "./pms-monitor";
import { measureLead } from "./fleet-lead";
import { unknownFleetStatus, type FleetStatusOf } from "./fleet-status";
import type { FleetLeadOf, StandardControlProps } from "./types";

export type { StandardControlProps } from "./types";

export type StandardDeviceEntry = {
  /** The type's standard control; null for a read-only type, which the device
   *  page shows through its attribute panes alone. */
  Control: ComponentType<StandardControlProps> | null;
  /** Full supervision-tab layout (control + companion cards). Types without
   *  one render their bare Control (see DeviceLiveControl). */
  Supervision?: ComponentType<StandardControlProps>;
  /** What the fleet card says the device is doing: its tile's activity and,
   *  for an HVAC unit, the status line (see fleet-status). */
  fleetStatus: FleetStatusOf;
  /** The fleet card lead's lines for a device of the type (see fleet-lead,
   *  rendered by FleetLeadView). */
  fleetLead: FleetLeadOf;
};

const registry: Partial<Record<DeviceType, StandardDeviceEntry>> = {
  [DeviceType.Thermostat]: {
    Control: ThermostatControl,
    Supervision: ThermostatSupervision,
    fleetStatus: thermostatFleetStatus,
    fleetLead: thermostatFleetLead,
  },
  [DeviceType.Awhp]: {
    Control: AwhpControl,
    Supervision: AwhpSupervision,
    fleetStatus: awhpFleetStatus,
    fleetLead: awhpFleetLead,
  },
  [DeviceType.WeatherSensor]: {
    Control: WeatherSensorControl,
    Supervision: WeatherSensorSupervision,
    fleetStatus: weatherSensorFleetStatus,
    fleetLead: weatherSensorFleetLead,
  },
  [DeviceType.ElectricityMeter]: {
    Control: ElectricityMeterControl,
    fleetStatus: electricityMeterFleetStatus,
    fleetLead: electricityMeterFleetLead,
  },
  [DeviceType.AhuDoubleFlux]: {
    Control: AhuDoubleFluxControl,
    fleetStatus: ahuDoubleFluxFleetStatus,
    fleetLead: ahuDoubleFluxFleetLead,
  },
  [DeviceType.AhuSingleFlux]: {
    Control: AhuSingleFluxControl,
    fleetStatus: ahuSingleFluxFleetStatus,
    fleetLead: ahuSingleFluxFleetLead,
  },
  [DeviceType.AirExtractor]: {
    Control: AirExtractorControl,
    fleetStatus: airExtractorFleetStatus,
    fleetLead: airExtractorFleetLead,
  },
  [DeviceType.PmsMonitor]: {
    Control: null,
    fleetStatus: pmsMonitorFleetStatus,
    fleetLead: pmsMonitorFleetLead,
  },
  [DeviceType.LiquidDetector]: {
    Control: LiquidDetectorControl,
    fleetStatus: liquidDetectorFleetStatus,
    fleetLead: liquidDetectorFleetLead,
  },
  [DeviceType.Pump]: {
    Control: PumpControl,
    fleetStatus: pumpFleetStatus,
    fleetLead: pumpFleetLead,
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

/** The fleet card lead for `type`: its registered one, or the primary
 *  measure (an em dash) for a device of no registered type. */
export function getFleetLead(type: string | null | undefined): FleetLeadOf {
  return getStandardDeviceEntry(type)?.fleetLead ?? measureLead;
}

/** The fleet card status for `type`: its registered one, or nothing to judge
 *  by for a device of no registered type. */
export function getFleetStatus(type: string | null | undefined): FleetStatusOf {
  return getStandardDeviceEntry(type)?.fleetStatus ?? unknownFleetStatus;
}
