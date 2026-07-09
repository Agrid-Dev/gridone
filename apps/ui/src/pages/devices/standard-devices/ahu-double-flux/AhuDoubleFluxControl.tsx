import {
  isAhuDoubleFlux,
  isAttributeWritable,
  readAhuDoubleFluxAttributes,
} from "@/lib/devices";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
import { AhuDoubleFluxSynoptic } from "./AhuDoubleFluxSynoptic";
import type { AhuDoubleFluxValues, AhuSetpointKey } from "./types";
import type { StandardControlProps } from "../types";

/** View key → wire attribute name; drafts and writes use the wire name. */
const SETPOINT_WIRE_NAMES: Record<AhuSetpointKey, string> = {
  supplyAirTemperatureSetpoint: "supply_air_temperature_setpoint",
  supplyAirPressureSetpoint: "supply_air_pressure_setpoint",
  extractAirPressureSetpoint: "extract_air_pressure_setpoint",
};

const SETPOINT_KEYS = Object.keys(SETPOINT_WIRE_NAMES) as AhuSetpointKey[];

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
    const pending = draft[SETPOINT_WIRE_NAMES[key]];
    if (pending != null) values[key] = Number(pending);
  }

  const writableSetpoints = SETPOINT_KEYS.filter((key) =>
    isAttributeWritable(device, SETPOINT_WIRE_NAMES[key]),
  );

  return (
    <AhuDoubleFluxSynoptic
      values={values}
      writableSetpoints={writableSetpoints}
      onSetpointSave={(key, value) =>
        changeAndSaveNow(SETPOINT_WIRE_NAMES[key], value)
      }
    />
  );
}
