import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  isGridoneError,
  type Dashboard,
  type DashboardCreate,
  type DashboardSummary,
} from "@gridone/sdk";
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

/**
 * Create a dashboard. On success the summaries list is invalidated (so the tab
 * bar picks up the new dashboard) and the created document is returned so the
 * caller can navigate to it. Errors surface as a toast.
 */
export function useCreateDashboard() {
  const { t } = useTranslation(["dashboards", "common"]);
  const client = useGridoneClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (params: DashboardCreate) => client.dashboards.create(params),
    onSuccess: async (created: Dashboard) => {
      await queryClient.invalidateQueries({ queryKey: DASHBOARDS_KEY });
      toast.success(t("create.success", { name: created.name }));
    },
    onError: (error: Error) => {
      const detail = isGridoneError(error) ? error.detail : error.message;
      toast.error(`${t("common:errors.default")}: ${detail}`);
    },
  });

  const createDashboard = (params: DashboardCreate) =>
    mutation.mutateAsync(params);

  return { createDashboard };
}
