import { isAttributeWritable } from "@/lib/devices";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
import type { StandardControlProps } from "../types";
import { AHU_WIRE_NAMES, readAhuUnits, type AhuUnits } from "./attributes";
import type { AhuReadings, AhuSetpointKey } from "./streams";

/** What an AHU control hands its synoptic: the display units, which
 *  setpoints this device accepts writes for, the write path, and the
 *  overlay of pending setpoint drafts on the device's readings (so a saved
 *  setpoint shows instantly). */
export function useAhuControl<K extends AhuSetpointKey>(
  { device, draft, onDraftChange }: StandardControlProps,
  setpointKeys: readonly K[],
): {
  units: AhuUnits;
  writableSetpoints: K[];
  saveSetpoint: (key: K, value: number) => void;
  withDrafts: <V extends AhuReadings>(values: V) => V;
} {
  const { changeAndSaveNow } = useDebouncedAttributeWrite({
    deviceId: device.id,
    onDraftChange,
  });

  return {
    units: readAhuUnits(device),
    writableSetpoints: setpointKeys.filter((key) =>
      isAttributeWritable(device, AHU_WIRE_NAMES[key]),
    ),
    saveSetpoint: (key, value) => changeAndSaveNow(AHU_WIRE_NAMES[key], value),
    withDrafts: (values) => {
      const overlaid = { ...values };
      for (const key of setpointKeys) {
        const pending = draft[AHU_WIRE_NAMES[key]];
        if (pending != null) overlaid[key] = Number(pending);
      }
      return overlaid;
    },
  };
}
