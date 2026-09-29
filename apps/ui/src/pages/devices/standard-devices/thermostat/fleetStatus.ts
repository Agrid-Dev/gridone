import { isThermostat, readThermostatAttributes } from "@/lib/devices";
import { hvacStatus, runState, UNKNOWN_STATUS } from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** On/off and the mode it regulates in. */
export const thermostatFleetStatus: FleetStatusOf = (device) => {
  if (!isThermostat(device)) return UNKNOWN_STATUS;
  const { onoffState, mode } = readThermostatAttributes(device);
  return hvacStatus(runState(onoffState, mode), mode);
};
