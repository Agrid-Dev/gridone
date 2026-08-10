import { useMemo } from "react";
import { useDeviceMetricsHistory } from "@/hooks/useDeviceMetricsHistory";

const METRICS = ["temperature"] as const;

/** Outdoor temperature readings and extrema over the last 24 hours. */
export function useWeatherTemperatureHistory(deviceId: string) {
  const { rows, timestamps, recordedMetrics, isLoading } =
    useDeviceMetricsHistory(deviceId, METRICS);

  const temperatures = useMemo(
    () =>
      rows.map((row) => {
        const value = row.values.temperature;
        return typeof value === "number" && Number.isFinite(value)
          ? value
          : null;
      }),
    [rows],
  );

  const range = useMemo(() => {
    const values = temperatures.filter(
      (value): value is number => value != null,
    );
    return values.length === 0
      ? { min: null, max: null }
      : { min: Math.min(...values), max: Math.max(...values) };
  }, [temperatures]);

  return {
    timestamps,
    temperatures,
    min: range.min,
    max: range.max,
    isLoading,
    hasData:
      recordedMetrics.has("temperature") &&
      temperatures.some((value) => value != null),
  };
}
