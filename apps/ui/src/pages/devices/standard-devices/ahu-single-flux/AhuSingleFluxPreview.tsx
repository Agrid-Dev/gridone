import { isAhuSingleFlux, readAhuSingleFluxAttributes } from "@/lib/devices";
import { AhuPreviewBody } from "../ahu-shared";
import type { StandardPreviewProps } from "../types";

export function AhuSingleFluxPreview({ device }: StandardPreviewProps) {
  if (!isAhuSingleFlux(device)) return null;
  const a = readAhuSingleFluxAttributes(device);

  return (
    <AhuPreviewBody
      supplyAirTemperature={a.supplyAirTemperature}
      supplyFanSpeed={a.supplyFanSpeed}
      hvacMode={a.hvacMode}
    />
  );
}
