import { isAhuSingleFlux, readAhuSingleFluxAttributes } from "@/lib/devices";
import { useAhuControl } from "../ahu-shared";
import { AhuSingleFluxSynoptic } from "./AhuSingleFluxSynoptic";
import type { AhuSingleFluxSetpointKey } from "./types";
import type { StandardControlProps } from "../types";

const SETPOINT_KEYS: readonly AhuSingleFluxSetpointKey[] = [
  "supplyAirTemperatureSetpoint",
  "supplyAirTemperatureCoolingSetpoint",
  "supplyAirPressureSetpoint",
  "supplyAirFlowSetpoint",
];

export function AhuSingleFluxControl(props: StandardControlProps) {
  const control = useAhuControl(props, SETPOINT_KEYS);
  if (!isAhuSingleFlux(props.device)) return null;
  return (
    <AhuSingleFluxSynoptic
      values={control.withDrafts(readAhuSingleFluxAttributes(props.device))}
      units={control.units}
      writableSetpoints={control.writableSetpoints}
      onSetpointSave={control.saveSetpoint}
    />
  );
}
