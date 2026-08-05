import { useMemo } from "react";
import { useDeviceMetricsHistory } from "@/hooks/useDeviceMetricsHistory";
import { computeChilledWaterKpis } from "./chilledWaterKpis";

const METRICS = [
  "outlet_temperature",
  "setpoint_temperature",
  "onoff_state",
  "energy",
] as const;

/** Chilled-water history over the last 24 h — outlet + setpoint shaped for
 *  {@link TimeSeriesChart} (the setpoint as an int series so it renders as a
 *  step line) plus the time-weighted KPIs, all computed on the same merged
 *  timeline. `onoff_state` and `energy` feed the KPIs only. */
export function useAwhpChilledWaterHistory(deviceId: string) {
  const { rows, timestamps, recordedMetrics, isLoading } =
    useDeviceMetricsHistory(deviceId, METRICS);

  const values = useMemo(
    () => ({
      outlet_temperature: rows.map(
        (r) => r.values.outlet_temperature as number | null,
      ),
      setpoint_temperature: rows.map(
        (r) => r.values.setpoint_temperature as number | null,
      ),
    }),
    [rows],
  );

  const kpis = useMemo(() => computeChilledWaterKpis(rows), [rows]);

  return {
    timestamps,
    values,
    kpis,
    isLoading,
    hasData: recordedMetrics.has("outlet_temperature") && rows.length > 0,
  };
}
