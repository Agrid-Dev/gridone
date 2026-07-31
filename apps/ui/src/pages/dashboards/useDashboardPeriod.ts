import { useMemo } from "react";
import { useSearchParams } from "react-router";
import {
  type TimeRange,
  DASHBOARD_DEFAULT_PRESET,
  parseRangeParams,
  rangeEndsNow,
  resolveTimeRange,
} from "@/lib/timeRange";

/** Aggregate widgets on an unattended screen re-poll on this cadence, but only
 *  while the period tracks the present (see `rangeEndsNow`). */
export const LIVE_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

/** Where the dashboard period picker remembers the last preset a user chose.
 *  Namespaced by app and view: the device-scoped pickers offer a different
 *  ladder, and must not inherit a window from here. */
export const DASHBOARD_PERIOD_STORAGE_KEY = "gridone.dashboards.period";

export type DashboardPeriod = {
  range: TimeRange;
  /** `start` / `end` / `last` as the timeseries API expects them. */
  query: ReturnType<typeof resolveTimeRange>;
  /** Ready to spread into a React Query options object. */
  refetchInterval: number | false;
};

/**
 * The dashboard-level viewing period, read from the URL.
 *
 * The period is a viewing concern, not dashboard state: it lives in the search
 * params (written by `TimeRangeSelect`), so a reload or a shared link
 * reproduces the same view, and every aggregate-bound widget on the page reads
 * the same window. Live-bound widgets ignore it.
 *
 * A bare URL falls back to the dashboard default rather than the device-scoped
 * one — the picker seeds the URL from any remembered preference before this is
 * read, so the fallback only applies when nothing has been chosen yet.
 *
 * No `timezone` is sent: the API defaults it to the deployment's building
 * timezone, which is the convention for every rendered timestamp. Passing the
 * browser's zone here would bucket a visitor's day differently from the
 * building's.
 */
export function useDashboardPeriod(): DashboardPeriod {
  const [searchParams] = useSearchParams();

  const range = useMemo(
    () => parseRangeParams(searchParams, DASHBOARD_DEFAULT_PRESET),
    [searchParams],
  );

  return useMemo(
    () => ({
      range,
      query: resolveTimeRange(range),
      refetchInterval: rangeEndsNow(range)
        ? LIVE_REFETCH_INTERVAL_MS
        : (false as const),
    }),
    [range],
  );
}
