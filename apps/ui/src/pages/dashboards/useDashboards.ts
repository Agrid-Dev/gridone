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
  type DashboardStructure,
  type DashboardStructureUpdate,
  type DashboardSummary,
  type LayoutItem,
  type StructureGroup,
} from "@gridone/sdk";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { readStoredStructure, writeStoredStructure } from "./dashboardsCache";
import { findGroup, flattenDashboards } from "./structure/structureTree";

/** Query key for the structure — the one list the UI reads dashboards from:
 *  the sidebar draws it as a tree, everything else flattens it. */
export const DASHBOARDS_KEY = ["dashboards", "structure"] as const;

/** Query key for a single full dashboard document. */
export const dashboardKey = (id: string) => ["dashboard", id] as const;

/** The one query behind every structure hook: each fetch refreshes the
 *  store the sidebar opens on. Seeded from that store, dated as ancient, so
 *  the first render has entries to draw and the request goes out regardless. */
function structureQuery(client: ReturnType<typeof useGridoneClient>) {
  return {
    queryKey: DASHBOARDS_KEY,
    queryFn: async () => {
      const structure = await client.dashboards.getStructure();
      writeStoredStructure(structure);
      return structure;
    },
    initialData: readStoredStructure,
    initialDataUpdatedAt: 0,
  };
}

/** The structure — sections, groups and where every dashboard sits.
 *  Suspends until loaded so callers render pure happy-path JSX under a
 *  `ResourceBoundary`. */
export function useDashboardStructure(): DashboardStructure {
  const client = useGridoneClient();
  const { data } = useSuspenseQuery(structureQuery(client));
  return data;
}

/** Summaries of every dashboard in display order — the redirect-to-first
 *  landing and the pickers. */
export function useDashboards(): DashboardSummary[] {
  return flattenDashboards(useDashboardStructure());
}

/** The structure for the shell, which must never suspend or fail: what was
 *  stored last time until the request answers, nothing before the first
 *  visit. `ready` is false only then, and on a failed first fetch. */
export function useDashboardStructureEntries(): {
  structure: DashboardStructure;
  ready: boolean;
} {
  const client = useGridoneClient();
  const { data } = useQuery(structureQuery(client));
  return { structure: data ?? { items: [] }, ready: data !== undefined };
}

/** The group a dashboard is a tab of, with its siblings — `null` for a
 *  dashboard that is an entry of its own. */
export function useDashboardGroup(dashboardId: string): StructureGroup | null {
  return findGroup(useDashboardStructure(), dashboardId);
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
      toast.success(t("edit.success", { name: updated.name }));
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

/** Replace the arrangement shared by every user (PUT /dashboards/structure).
 *  The response is the structure as stored, so it lands in the cache — and
 *  the store the sidebar opens on — without a refetch. */
export function useUpdateStructure() {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const onApiError = useApiErrorToast();

  const mutation = useMutation({
    mutationFn: (update: DashboardStructureUpdate) =>
      client.dashboards.updateStructure(update),
    onSuccess: (structure: DashboardStructure) => {
      queryClient.setQueryData(DASHBOARDS_KEY, structure);
      writeStoredStructure(structure);
    },
    onError: onApiError,
  });

  return {
    updateStructure: (update: DashboardStructureUpdate) =>
      mutation.mutateAsync(update),
    saving: mutation.isPending,
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
