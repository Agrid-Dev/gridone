import { useMemo } from "react";
import { useSearchParams } from "react-router";
import {
  type TimeRange,
  parseRangeParams,
  rangeEndsNow,
  resolveTimeRange,
} from "@/lib/timeRange";

/** Aggregate widgets on an unattended screen re-poll on this cadence, but only
 *  while the period tracks the present (see `rangeEndsNow`). */
export const LIVE_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

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
 * No `timezone` is sent: the API defaults it to the deployment's building
 * timezone, which is the convention for every rendered timestamp. Passing the
 * browser's zone here would bucket a visitor's day differently from the
 * building's.
 */
export function useDashboardPeriod(): DashboardPeriod {
  const [searchParams] = useSearchParams();

  const range = useMemo(() => parseRangeParams(searchParams), [searchParams]);

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
