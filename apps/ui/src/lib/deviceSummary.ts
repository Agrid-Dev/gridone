/**
 * One-line summaries of a device's live state for fleet views (devices
 * table): primary measure, setpoint and operating mode per standard type,
 * plus fleet-wide connection-status counts.
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
import { fmt } from "@/lib/formatValue";

const DASH = "—";

/** The primary live measure of a device, formatted ("20.5°", "1250 W",
 *  "82 %"); em dash when absent or the type has no primary measure. */
export function deviceMeasure(device: Device): string {
  if (isThermostat(device))
    return fmt(readThermostatAttributes(device).temperature, 1, "°");
  if (isAwhp(device))
    return fmt(readAwhpAttributes(device).outletTemperature, 1, "°");
  if (isAhuDoubleFlux(device))
    return fmt(
      readAhuDoubleFluxAttributes(device).supplyAirTemperature,
      1,
      "°",
    );
  if (isAhuSingleFlux(device))
    return fmt(
      readAhuSingleFluxAttributes(device).supplyAirTemperature,
      1,
      "°",
    );
  if (isElectricityMeter(device))
    return fmt(readElectricityMeterAttributes(device).activePower, 0, " W");
  if (isWeatherSensor(device))
    return fmt(readWeatherSensorAttributes(device).temperature, 1, "°");
  if (isAirExtractor(device))
    return fmt(readAirExtractorAttributes(device).fanSpeed, 0, " %");
  return DASH;
}

/** The setpoint matching {@link deviceMeasure}; em dash when the type has
 *  none (meters, sensors, extractors) or the value is absent. */
export function deviceSetpoint(device: Device): string {
  if (isThermostat(device))
    return fmt(readThermostatAttributes(device).temperatureSetpoint, 1, "°");
  if (isAwhp(device))
    return fmt(readAwhpAttributes(device).setpointTemperature, 1, "°");
  if (isAhuDoubleFlux(device))
    return fmt(
      readAhuDoubleFluxAttributes(device).supplyAirTemperatureSetpoint,
      1,
      "°",
    );
  if (isAhuSingleFlux(device))
    return fmt(
      readAhuSingleFluxAttributes(device).supplyAirTemperatureSetpoint,
      1,
      "°",
    );
  return DASH;
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
