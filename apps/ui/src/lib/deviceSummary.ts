/**
 * One-line summaries of a device's live state for fleet views (devices table
 * and cards): primary measure, setpoint and operating mode per standard type,
 * plus fleet-wide connection-status counts.
 *
 * A measure is exposed as a *reading* — the numeric value plus how to render
 * and where to find it — rather than a pre-formatted string, so the same
 * source of truth can be formatted, subtracted (measure vs setpoint) and
 * charted (the metric names the recorded series).
 *
 * Formatting follows the app convention (no assumed physical units): a
 * scale-agnostic `°` for temperatures, raw `W` for power, `%` for ratios.
 */
import type { Device } from "@gridone/sdk";
import {
  ConnectionStatus,
  getConnectionStatus,
  isAhuDoubleFlux,
  isAhuSingleFlux,
  isAirExtractor,
  isAwhp,
  isElectricityMeter,
  isThermostat,
  isWeatherSensor,
  readAhuDoubleFluxAttributes,
  readAhuSingleFluxAttributes,
  readAirExtractorAttributes,
  readAwhpAttributes,
  readElectricityMeterAttributes,
  readThermostatAttributes,
  readWeatherSensorAttributes,
} from "@/lib/devices";
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

const temperature = (metric: string, value: number | null): DeviceReading => ({
  metric,
  value,
  digits: 1,
  suffix: "°",
});

/** The primary live measure of a device (the one a fleet view leads with);
 *  null when the type has no primary measure. */
export function deviceMeasureReading(device: Device): DeviceReading | null {
  if (isThermostat(device))
    return temperature(
      "temperature",
      readThermostatAttributes(device).temperature,
    );
  if (isAwhp(device))
    return temperature(
      "outlet_temperature",
      readAwhpAttributes(device).outletTemperature,
    );
  if (isAhuDoubleFlux(device))
    return temperature(
      "supply_air_temperature",
      readAhuDoubleFluxAttributes(device).supplyAirTemperature,
    );
  if (isAhuSingleFlux(device))
    return temperature(
      "supply_air_temperature",
      readAhuSingleFluxAttributes(device).supplyAirTemperature,
    );
  if (isElectricityMeter(device))
    return {
      metric: "active_power",
      value: readElectricityMeterAttributes(device).activePower,
      digits: 0,
      suffix: " W",
    };
  if (isWeatherSensor(device))
    return temperature(
      "temperature",
      readWeatherSensorAttributes(device).temperature,
    );
  if (isAirExtractor(device))
    return {
      metric: "fan_speed",
      value: readAirExtractorAttributes(device).fanSpeed,
      digits: 0,
      suffix: " %",
    };
  return null;
}

/** The setpoint matching {@link deviceMeasureReading}; null when the type has
 *  none (meters, sensors, extractors). */
export function deviceSetpointReading(device: Device): DeviceReading | null {
  if (isThermostat(device))
    return temperature(
      "temperature_setpoint",
      readThermostatAttributes(device).temperatureSetpoint,
    );
  if (isAwhp(device))
    return temperature(
      "setpoint_temperature",
      readAwhpAttributes(device).setpointTemperature,
    );
  if (isAhuDoubleFlux(device))
    return temperature(
      "supply_air_temperature_setpoint",
      readAhuDoubleFluxAttributes(device).supplyAirTemperatureSetpoint,
    );
  if (isAhuSingleFlux(device))
    return temperature(
      "supply_air_temperature_setpoint",
      readAhuSingleFluxAttributes(device).supplyAirTemperatureSetpoint,
    );
  return null;
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

/** Signed distance from setpoint to measure ("+0,4°"), or null when either
 *  side is missing. Always rendered with its sign — the sign is the reading. */
export function formatReadingDelta(
  measure: DeviceReading | null,
  setpoint: DeviceReading | null,
  locale: string,
): string | null {
  if (measure?.value == null || setpoint?.value == null) return null;
  const delta = measure.value - setpoint.value;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: measure.digits,
    maximumFractionDigits: measure.digits,
    signDisplay: "always",
  }).format(delta);
  return `${number}${measure.suffix}`;
}

/** Operating mode of a device for display. "Off" is not a wire mode value:
 *  it is composed from `onoff_state === false`, which wins over the mode
 *  attribute (a stopped unit's configured mode is inert). */
export type DeviceMode =
  | { kind: "onoff"; value: "on" | "off" }
  | { kind: "mode"; attribute: "mode" | "hvac_mode"; value: string };

export function deviceMode(device: Device): DeviceMode | null {
  if (isThermostat(device)) {
    const a = readThermostatAttributes(device);
    return composeMode(a.onoffState, a.mode, "mode");
  }
  if (isAwhp(device)) {
    const a = readAwhpAttributes(device);
    return composeMode(a.onoffState, a.mode, "mode");
  }
  if (isAhuDoubleFlux(device)) {
    const a = readAhuDoubleFluxAttributes(device);
    return composeMode(a.onoffState, a.hvacMode, "hvac_mode");
  }
  if (isAhuSingleFlux(device)) {
    const a = readAhuSingleFluxAttributes(device);
    return composeMode(a.onoffState, a.hvacMode, "hvac_mode");
  }
  if (isAirExtractor(device)) {
    const { onoffState } = readAirExtractorAttributes(device);
    if (onoffState == null) return null;
    return { kind: "onoff", value: onoffState ? "on" : "off" };
  }
  return null;
}

function composeMode(
  onoffState: boolean | null,
  mode: string | null,
  attribute: "mode" | "hvac_mode",
): DeviceMode | null {
  if (onoffState === false) return { kind: "onoff", value: "off" };
  if (mode == null) return null;
  return { kind: "mode", attribute, value: mode };
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
