import { isAhuDoubleFlux, readAhuDoubleFluxAttributes } from "@/lib/devices";
import {
  coilMode,
  hvacStatus,
  runState,
  UNKNOWN_STATUS,
} from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** On/off, and what its coil does to the supply air. */
export const ahuDoubleFluxFleetStatus: FleetStatusOf = (device) => {
  if (!isAhuDoubleFlux(device)) return UNKNOWN_STATUS;
  const { onoffState, hvacMode, heatingValve, coolingValve } =
    readAhuDoubleFluxAttributes(device);
  return hvacStatus(
    runState(onoffState, hvacMode),
    coilMode(heatingValve, coolingValve, hvacMode),
  );
};
