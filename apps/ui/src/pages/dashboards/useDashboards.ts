import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type Dashboard,
  type DashboardCreate,
  type DashboardPatch,
  type DashboardSummary,
  type LayoutItem,
} from "@gridone/sdk";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { readStoredDashboards, writeStoredDashboards } from "./dashboardsCache";

/** Query key for the dashboard summaries list (feeds the view selector). */
export const DASHBOARDS_KEY = ["dashboards"] as const;

/** Query key for a single full dashboard document. */
export const dashboardKey = (id: string) => ["dashboard", id] as const;

/** The one query behind both summary hooks: every fetch refreshes the store
 *  the sidebar opens on. Seeded from that store, dated as ancient, so the
 *  first render has entries to draw and the request goes out regardless. */
function dashboardsQuery(client: ReturnType<typeof useGridoneClient>) {
  return {
    queryKey: DASHBOARDS_KEY,
    queryFn: async () => {
      const summaries = await client.dashboards.list();
      writeStoredDashboards(summaries);
      return summaries;
    },
    initialData: readStoredDashboards,
    initialDataUpdatedAt: 0,
  };
}

/**
 * Summaries of every dashboard (id, name, description) — the redirect-to-first
 * landing and the toolbox. Suspends until loaded so callers render pure
 * happy-path JSX under a `ResourceBoundary`.
 */
export function useDashboards(): DashboardSummary[] {
  const client = useGridoneClient();
  const { data } = useSuspenseQuery(dashboardsQuery(client));
  return data;
}

/** The same summaries for the shell, which must never suspend or fail:
 *  what was stored last time until the list arrives, nothing before the
 *  first visit. `ready` is false only then, and on a failed first fetch. */
export function useDashboardEntries(): {
  dashboards: DashboardSummary[];
  ready: boolean;
} {
  const client = useGridoneClient();
  const { data } = useQuery(dashboardsQuery(client));
  return { dashboards: data ?? [], ready: data !== undefined };
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
 * Create a dashboard. On success the summaries list is invalidated (so the view
 * selector picks up the new dashboard) and the created document is returned so the
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
      const detail = serverErrorMessage(error);
      const base = t("common:errors.default");
      toast.error(detail ? `${base}: ${detail}` : base);
    },
  });

  const createDashboard = (params: DashboardCreate) =>
    mutation.mutateAsync(params);

  return { createDashboard };
}

function useApiErrorToast() {
  const { t } = useTranslation("common");
  return (error: Error) => {
    const detail = serverErrorMessage(error);
    const base = t("errors.default");
    toast.error(detail ? `${base}: ${detail}` : base);
  };
}

/** Rename / re-describe a dashboard (PUT name/description). Invalidates the
 *  summaries (selector labels) and the dashboard document. */
export function useUpdateDashboard() {
  const { t } = useTranslation("dashboards");
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const onApiError = useApiErrorToast();

  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DashboardPatch }) =>
      client.dashboards.update(id, patch),
    onSuccess: async (updated: Dashboard) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: DASHBOARDS_KEY }),
        queryClient.invalidateQueries({ queryKey: dashboardKey(updated.id) }),
      ]);
      toast.success(t("rename.success", { name: updated.name }));
    },
    onError: onApiError,
  });

  const updateDashboard = (id: string, patch: DashboardPatch) =>
    mutation.mutateAsync({ id, patch });

  return { updateDashboard };
}

/** Delete a dashboard. Invalidates the summaries; the caller navigates to the
 *  next dashboard (or the empty state). */
export function useDeleteDashboard() {
  const { t } = useTranslation("dashboards");
  const client = useGridoneClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => client.dashboards.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DASHBOARDS_KEY });
      toast.success(t("delete.success"));
    },
  });

  const deleteDashboard = (
    id: string,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => mutation.mutateAsync(id, options);

  return { deleteDashboard };
}

/** Set the display order shared by every user (PUT /dashboards/order).
 *  Optimistic: the summaries — and the store the sidebar opens on — take the
 *  new order at once and fall back to the previous one if the server refuses. */
export function useReorderDashboards() {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const onApiError = useApiErrorToast();

  const mutation = useMutation({
    mutationFn: (orderedIds: string[]) =>
      client.dashboards.reorder({ ordered_ids: orderedIds }),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: DASHBOARDS_KEY });
      const previous =
        queryClient.getQueryData<DashboardSummary[]>(DASHBOARDS_KEY);
      if (previous) {
        const byId = new Map(previous.map((summary) => [summary.id, summary]));
        const reordered = orderedIds.flatMap((id) => byId.get(id) ?? []);
        queryClient.setQueryData(DASHBOARDS_KEY, reordered);
        writeStoredDashboards(reordered);
      }
      return { previous };
    },
    onError: (error: Error, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(DASHBOARDS_KEY, context.previous);
        writeStoredDashboards(context.previous);
      }
      onApiError(error);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: DASHBOARDS_KEY }),
  });

  return {
    reorderDashboards: (orderedIds: string[]) => mutation.mutate(orderedIds),
  };
}

/** Replace a dashboard's grid layout (PUT /dashboards/{id}/layout). Invalidates
 *  the dashboard document so the grid re-renders from the persisted layout. */
export function useUpdateLayout(dashboardId: string) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const onApiError = useApiErrorToast();

  const mutation = useMutation({
    mutationFn: (items: LayoutItem[]) =>
      client.dashboards.updateLayout(dashboardId, items),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKey(dashboardId),
      });
    },
    onError: onApiError,
  });

  return { updateLayout: (items: LayoutItem[]) => mutation.mutateAsync(items) };
}
