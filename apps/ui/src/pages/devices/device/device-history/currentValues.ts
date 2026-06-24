import type { DataPoint } from "@/api/timeseries";
import type { CellValue } from "./mergeTimeSeries";

export type CurrentValue = {
  value: CellValue;
  /** When the value was last observed — the synthetic point's timestamp. */
  timestamp: string;
};

/**
 * Append each attribute's current (live) value as a synthetic latest data
 * point so a merged time-series reflects the device's present state — matching
 * the header status badge — rather than only the last recorded sample.
 *
 * The badge reads `device.attributes[attr].currentValue`, which can be newer
 * than the last recorded point: a push device flips its `connectionStatus` to
 * "degraded" when uplinks stop arriving, without writing a new sample. Without
 * this, the chart's right edge keeps showing the stale last-recorded value
 * (e.g. "ok") while the badge already reads "degraded".
 *
 * Inputs are not mutated. Attributes with a null current value are skipped.
 */
export function appendCurrentValues(
  pointsByMetric: Record<string, DataPoint[]>,
  currentValues: Record<string, CurrentValue | null | undefined>,
): Record<string, DataPoint[]> {
  const result: Record<string, DataPoint[]> = { ...pointsByMetric };
  for (const [metric, current] of Object.entries(currentValues)) {
    if (!current || current.value === null) continue;
    result[metric] = [
      ...(result[metric] ?? []),
      { timestamp: current.timestamp, value: current.value },
    ];
  }
  return result;
}
