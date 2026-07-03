import { isAhuSingleFlux, readAhuSingleFluxAttributes } from "@/api/devices";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
import { AhuSingleFluxSynoptic } from "./AhuSingleFluxSynoptic";
import type { AhuSingleFluxSetpointKey, AhuSingleFluxValues } from "./types";
import type { StandardControlProps } from "../types";

const SETPOINT_KEYS: readonly AhuSingleFluxSetpointKey[] = [
  "supplyAirTemperatureSetpoint",
  "supplyAirPressureSetpoint",
];

export function AhuSingleFluxControl({
  device,
  draft,
  onDraftChange,
}: StandardControlProps) {
  const { changeAndSaveNow } = useDebouncedAttributeWrite({
    deviceId: device.id,
    onDraftChange,
  });

  if (!isAhuSingleFlux(device)) return null;

  // Overlay pending drafts so a saved setpoint shows instantly.
  const values: AhuSingleFluxValues = {
    ...readAhuSingleFluxAttributes(device),
  };
  for (const key of SETPOINT_KEYS) {
    const pending = draft[key];
    if (pending != null) values[key] = Number(pending);
  }

  const writableSetpoints = SETPOINT_KEYS.filter((key) =>
    device.attributes[key]?.readWriteModes.includes("write"),
  );

  return (
    <AhuSingleFluxSynoptic
      values={values}
      writableSetpoints={writableSetpoints}
      onSetpointSave={(key, value) => changeAndSaveNow(key, value)}
    />
  );
}
