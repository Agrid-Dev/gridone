import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import { DASHBOARD_DEFAULT_PRESET, writeRangeParams } from "@/lib/timeRange";
import { useDashboardPeriod } from "./useDashboardPeriod";

/** Only the viewing period follows a dashboard switch. Layout editing and
 *  other query parameters belong to the dashboard being left. */
export function useDashboardNavigation() {
  const { open } = useResourceNavigation();
  const { range } = useDashboardPeriod();
  const search = writeRangeParams(
    new URLSearchParams(),
    range,
    DASHBOARD_DEFAULT_PRESET,
  ).toString();

  return (id: string) =>
    open({ pathname: `/dashboards/${encodeURIComponent(id)}`, search });
}
