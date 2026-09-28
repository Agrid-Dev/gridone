import type { ComponentType } from "react";
import { DeviceType } from "@/lib/devices";
import {
  ThermostatControl,
  ThermostatFleetGlyph,
  ThermostatSupervision,
  thermostatFleetLead,
} from "./thermostat";
import {
  AwhpControl,
  AwhpFleetGlyph,
  AwhpSupervision,
  awhpFleetLead,
} from "./awhp";
import {
  WeatherSensorControl,
  WeatherSensorFleetGlyph,
  WeatherSensorSupervision,
  weatherSensorFleetLead,
} from "./weather-sensor";
import {
  ElectricityMeterControl,
  ElectricityMeterFleetGlyph,
  electricityMeterFleetLead,
} from "./electricity-meter";
import {
  AhuDoubleFluxControl,
  AhuDoubleFluxFleetGlyph,
  ahuDoubleFluxFleetLead,
} from "./ahu-double-flux";
import {
  AhuSingleFluxControl,
  AhuSingleFluxFleetGlyph,
  ahuSingleFluxFleetLead,
} from "./ahu-single-flux";
import {
  AirExtractorControl,
  AirExtractorFleetGlyph,
  airExtractorFleetLead,
} from "./air-extractor";
import {
  LiquidDetectorControl,
  LiquidDetectorFleetGlyph,
  liquidDetectorFleetLead,
} from "./liquid-detector";
import { PumpControl, PumpFleetGlyph, pumpFleetLead } from "./pump";
import { PmsMonitorFleetGlyph, pmsMonitorFleetLead } from "./pms-monitor";
import { OtherFleetGlyph } from "./OtherFleetGlyph";
import { measureLead } from "./fleet-lead";
import type {
  FleetLeadOf,
  StandardControlProps,
  StandardFleetGlyphProps,
} from "./types";

export type { StandardFleetGlyphProps, StandardControlProps } from "./types";

export type StandardDeviceEntry = {
  /** The type's standard control; null for a read-only type, which the device
   *  page shows through its attribute panes alone. */
  Control: ComponentType<StandardControlProps> | null;
  /** Full supervision-tab layout (control + companion cards). Types without
   *  one render their bare Control (see DeviceLiveControl). */
  Supervision?: ComponentType<StandardControlProps>;
  /** The type's glyph in front of the fleet card lead: a silhouette of the
   *  machine carrying its one state (see glyph-kit). */
  FleetGlyph: ComponentType<StandardFleetGlyphProps>;
  /** The fleet card lead's lines for a device of the type (see fleet-lead,
   *  rendered by FleetLeadView). */
  fleetLead: FleetLeadOf;
};

const registry: Partial<Record<DeviceType, StandardDeviceEntry>> = {
  [DeviceType.Thermostat]: {
    Control: ThermostatControl,
    Supervision: ThermostatSupervision,
    FleetGlyph: ThermostatFleetGlyph,
    fleetLead: thermostatFleetLead,
  },
  [DeviceType.Awhp]: {
    Control: AwhpControl,
    Supervision: AwhpSupervision,
    FleetGlyph: AwhpFleetGlyph,
    fleetLead: awhpFleetLead,
  },
  [DeviceType.WeatherSensor]: {
    Control: WeatherSensorControl,
    Supervision: WeatherSensorSupervision,
    FleetGlyph: WeatherSensorFleetGlyph,
    fleetLead: weatherSensorFleetLead,
  },
  [DeviceType.ElectricityMeter]: {
    Control: ElectricityMeterControl,
    FleetGlyph: ElectricityMeterFleetGlyph,
    fleetLead: electricityMeterFleetLead,
  },
  [DeviceType.AhuDoubleFlux]: {
    Control: AhuDoubleFluxControl,
    FleetGlyph: AhuDoubleFluxFleetGlyph,
    fleetLead: ahuDoubleFluxFleetLead,
  },
  [DeviceType.AhuSingleFlux]: {
    Control: AhuSingleFluxControl,
    FleetGlyph: AhuSingleFluxFleetGlyph,
    fleetLead: ahuSingleFluxFleetLead,
  },
  [DeviceType.AirExtractor]: {
    Control: AirExtractorControl,
    FleetGlyph: AirExtractorFleetGlyph,
    fleetLead: airExtractorFleetLead,
  },
  [DeviceType.PmsMonitor]: {
    Control: null,
    FleetGlyph: PmsMonitorFleetGlyph,
    fleetLead: pmsMonitorFleetLead,
  },
  [DeviceType.LiquidDetector]: {
    Control: LiquidDetectorControl,
    FleetGlyph: LiquidDetectorFleetGlyph,
    fleetLead: liquidDetectorFleetLead,
  },
  [DeviceType.Pump]: {
    Control: PumpControl,
    FleetGlyph: PumpFleetGlyph,
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

/** The fleet card glyph for `type`: its registered glyph, or the neutral chip
 *  for a device of no registered type. */
export function getFleetGlyph(
  type: string | null | undefined,
): ComponentType<StandardFleetGlyphProps> {
  return getStandardDeviceEntry(type)?.FleetGlyph ?? OtherFleetGlyph;
}
