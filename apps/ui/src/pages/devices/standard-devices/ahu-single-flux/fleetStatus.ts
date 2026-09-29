import { isAhuSingleFlux, readAhuSingleFluxAttributes } from "@/lib/devices";
import {
  coilMode,
  hvacStatus,
  runState,
  UNKNOWN_STATUS,
} from "../fleet-status";
import type { FleetStatusOf } from "../fleet-status";

/** On/off, and what its coil does to the supply air. */
export const ahuSingleFluxFleetStatus: FleetStatusOf = (device) => {
  if (!isAhuSingleFlux(device)) return UNKNOWN_STATUS;
  const { onoffState, hvacMode, heatingValve, coolingValve } =
    readAhuSingleFluxAttributes(device);
  return hvacStatus(
    runState(onoffState, hvacMode),
    coilMode(heatingValve, coolingValve, hvacMode),
  );
};
