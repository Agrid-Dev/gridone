import { isAhuDoubleFlux, readAhuDoubleFluxAttributes } from "@/lib/devices";
import { useAhuControl } from "../ahu-shared";
import { AhuDoubleFluxSynoptic } from "./AhuDoubleFluxSynoptic";
import type { AhuSetpointKey } from "./types";
import type { StandardControlProps } from "../types";

const SETPOINT_KEYS: readonly AhuSetpointKey[] = [
  "supplyAirTemperatureSetpoint",
  "supplyAirTemperatureCoolingSetpoint",
  "supplyAirPressureSetpoint",
  "extractAirPressureSetpoint",
  "supplyAirFlowSetpoint",
  "extractAirFlowSetpoint",
];

export function AhuDoubleFluxControl(props: StandardControlProps) {
  const control = useAhuControl(props, SETPOINT_KEYS);
  if (!isAhuDoubleFlux(props.device)) return null;
  return (
    <AhuDoubleFluxSynoptic
      values={control.withDrafts(readAhuDoubleFluxAttributes(props.device))}
      units={control.units}
      writableSetpoints={control.writableSetpoints}
      onSetpointSave={control.saveSetpoint}
    />
  );
}
