import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { Dashboard, DashboardSummary } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** Query key for the dashboard summaries list (feeds the tab bar). */
export const DASHBOARDS_KEY = ["dashboards"] as const;

/** Query key for a single full dashboard document. */
export const dashboardKey = (id: string) => ["dashboard", id] as const;

/**
 * Summaries of every dashboard (id, name, description) — the tab bar and the
 * redirect-to-first landing. Suspends until loaded so callers render pure
 * happy-path JSX under a `ResourceBoundary`.
 */
export function useDashboards(): DashboardSummary[] {
  const client = useGridoneClient();
  const { data } = useSuspenseQuery<DashboardSummary[]>({
    queryKey: DASHBOARDS_KEY,
    queryFn: () => client.dashboards.list(),
  });
  return data;
}

/**
 * The full dashboard named by the `:dashboardId` route param. Suspends while
 * loading; an unknown id propagates as `GridoneError(404)` from the backend
 * (→ not-found fallback), so the returned dashboard is always defined. A
 * missing param is a route-config bug, not a 404, so it raises a plain error
 * (→ generic error fallback).
 */
export function useDashboardFromRoute(): Dashboard {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const client = useGridoneClient();
  if (!dashboardId) {
    throw new Error(
      "useDashboardFromRoute requires a 'dashboardId' route param",
    );
  }
  const { data } = useSuspenseQuery<Dashboard>({
    queryKey: dashboardKey(dashboardId),
    queryFn: () => client.dashboards.get(dashboardId),
  });
  return data;
}
