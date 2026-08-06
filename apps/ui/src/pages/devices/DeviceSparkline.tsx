import { useMemo } from "react";
import { Sparkline } from "@/components/charts/Sparkline";
import { useDeviceMetricsHistory } from "@/hooks/useDeviceMetricsHistory";

/**
 * The last day of a device's primary metric, as a trend line.
 *
 * Reading the history costs one series lookup plus one points fetch *per
 * device* — there is no fleet-wide points endpoint — so the fleet grid mounts
 * this only once a card has scrolled into view. Mounting is therefore the
 * fetch gate: keep it that way rather than adding an `enabled` prop, or every
 * card in the fleet pays on page load.
 */
export function DeviceSparkline({
  deviceId,
  metric,
  label,
}: {
  deviceId: string;
  metric: string;
  label: string;
}) {
  const metrics = useMemo(() => [metric], [metric]);
  const { rows } = useDeviceMetricsHistory(deviceId, metrics, "1d");

  const values = useMemo(
    () =>
      rows
        .map((row) => row.values[metric])
        .filter((value): value is number => typeof value === "number"),
    [rows, metric],
  );

  return <Sparkline values={values} ariaLabel={label} />;
}
