/**
 * Device readings for fleet views — a numeric attribute with how to render
 * it — plus fleet-wide connection-status counts.
 *
 * A measure is exposed as a *reading* — the numeric value plus how to render
 * and where to find it — rather than a pre-formatted string, so the same
 * source of truth can be formatted and charted (the metric names the recorded
 * series).
 *
 * Units are the driver-declared ones when an attribute carries one; else the
 * app convention (no assumed physical units): a scale-agnostic `°` for
 * temperatures, raw `W` for power, `%` for ratios.
 *
 * Nothing here branches on a device type: which attribute a type leads with
 * is data (`PRIMARY_MEASURES`), and what a type shows on its card lives with
 * the type in the standard-device registry.
 */
import type { Device } from "@gridone/sdk";
import {
  ConnectionStatus,
  DeviceType,
  getConnectionStatus,
} from "@/lib/devices";
import { attributeUnit } from "@/lib/attributeUnits";

const DASH = "—";

/**
 * A displayable measure: the recorded `metric` it comes from (the attribute
 * name, which is also the time-series key), its current `value`, and how to
 * render it. `value` is null when the device does not report it (yet).
 */
export type DeviceReading = {
  metric: string;
  value: number | null;
  digits: number;
  suffix: string;
};

/** Where a reading comes from: the attribute, its decimals, and the unit to
 *  assume when the driver declares none and the name implies none. */
export type ReadingSpec = {
  metric: string;
  digits: number;
  fallbackUnit?: string;
};

/** A temperature attribute: one decimal, `°` unless the driver says more. */
export const temperatureSpec = (metric: string): ReadingSpec => ({
  metric,
  digits: 1,
});

/** The measure each standard type leads with — the one a fleet view shows
 *  for a device (fleet card, 3D room panel). Types absent here have none. */
const PRIMARY_MEASURES: Partial<Record<DeviceType, ReadingSpec>> = {
  [DeviceType.Thermostat]: temperatureSpec("temperature"),
  [DeviceType.Awhp]: temperatureSpec("outlet_temperature"),
  [DeviceType.AhuDoubleFlux]: temperatureSpec("supply_air_temperature"),
  [DeviceType.AhuSingleFlux]: temperatureSpec("supply_air_temperature"),
  [DeviceType.WeatherSensor]: temperatureSpec("temperature"),
  [DeviceType.ElectricityMeter]: {
    metric: "active_power",
    digits: 0,
    fallbackUnit: "W",
  },
  [DeviceType.AirExtractor]: {
    metric: "fan_speed",
    digits: 0,
    fallbackUnit: "%",
  },
};

/** Separator + symbol after a number: a bare `°` hugs it ("21,5°"), any
 *  other unit takes a space ("14,2 °C", "240 kW", "55 %"). */
const unitSuffix = (unit: string) => (unit === "°" ? unit : ` ${unit}`);

/** The attribute `spec` names as a reading: its numeric value (null when not
 *  reported), in the unit the driver declares, else the name's convention,
 *  else the spec's fallback. */
export function attributeReading(
  device: Device,
  { metric, digits, fallbackUnit }: ReadingSpec,
): DeviceReading {
  const attribute = device.attributes?.[metric];
  const raw = attribute?.current_value;
  const unit = attributeUnit(metric, attribute) ?? fallbackUnit;
  return {
    metric,
    value: typeof raw === "number" ? raw : null,
    digits,
    suffix: unit ? unitSuffix(unit) : "",
  };
}

/** The primary live measure of a device (the one a fleet view leads with);
 *  null when its type has no primary measure. */
export function deviceMeasureReading(device: Device): DeviceReading | null {
  const spec = device.type
    ? PRIMARY_MEASURES[device.type as DeviceType]
    : undefined;
  return spec ? attributeReading(device, spec) : null;
}

/** Reading rendered for the given locale ("20,5°", "1 250 W"); em dash when
 *  the reading is absent or its value is not reported. */
export function formatReading(
  reading: DeviceReading | null,
  locale: string,
): string {
  if (!reading || reading.value == null) return DASH;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: reading.digits,
    maximumFractionDigits: reading.digits,
  }).format(reading.value);
  return `${number}${reading.suffix}`;
}

export type ConnectionCounts = Record<ConnectionStatus, number>;

/** Fleet-wide connection-status tally. Devices without a
 *  `connection_status` attribute are counted in no bucket. */
export function countByConnectionStatus(
  devices: readonly Device[],
): ConnectionCounts {
  const counts: ConnectionCounts = {
    [ConnectionStatus.Idle]: 0,
    [ConnectionStatus.Ok]: 0,
    [ConnectionStatus.Degraded]: 0,
    [ConnectionStatus.Error]: 0,
  };
  for (const device of devices) {
    const status = getConnectionStatus(device);
    if (status) counts[status] += 1;
  }
  return counts;
}
