import { isAhuDoubleFlux, readAhuDoubleFluxAttributes } from "@/lib/devices";
import { AhuPreviewBody } from "../ahu-shared";
import type { StandardPreviewProps } from "../types";

export function AhuDoubleFluxPreview({ device }: StandardPreviewProps) {
  if (!isAhuDoubleFlux(device)) return null;
  const a = readAhuDoubleFluxAttributes(device);

  return (
    <AhuPreviewBody
      supplyAirTemperature={a.supplyAirTemperature}
      supplyFanSpeed={a.supplyFanSpeed}
      hvacMode={a.hvacMode}
    />
  );
}
