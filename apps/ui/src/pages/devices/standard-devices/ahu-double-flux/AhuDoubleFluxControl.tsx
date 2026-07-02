import { isAhuDoubleFlux, readAhuDoubleFluxAttributes } from "@/api/devices";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
import { AhuDoubleFluxSynoptic } from "./AhuDoubleFluxSynoptic";
import type { AhuDoubleFluxValues, AhuSetpointKey } from "./types";
import type { StandardControlProps } from "../types";

const SETPOINT_KEYS: readonly AhuSetpointKey[] = [
  "supplyAirTemperatureSetpoint",
  "supplyAirPressureSetpoint",
  "extractAirPressureSetpoint",
];

export function AhuDoubleFluxControl({
  device,
  draft,
  onDraftChange,
}: StandardControlProps) {
  const { changeAndSaveNow } = useDebouncedAttributeWrite({
    deviceId: device.id,
    onDraftChange,
  });

  if (!isAhuDoubleFlux(device)) return null;

  // Overlay pending drafts so a saved setpoint shows instantly.
  const values: AhuDoubleFluxValues = {
    ...readAhuDoubleFluxAttributes(device),
  };
  for (const key of SETPOINT_KEYS) {
    const pending = draft[key];
    if (pending != null) values[key] = Number(pending);
  }

  const writableSetpoints = SETPOINT_KEYS.filter((key) =>
    device.attributes[key]?.readWriteModes.includes("write"),
  );

  return (
    <AhuDoubleFluxSynoptic
      values={values}
      writableSetpoints={writableSetpoints}
      onSetpointSave={(key, value) => changeAndSaveNow(key, value)}
    />
  );
}
