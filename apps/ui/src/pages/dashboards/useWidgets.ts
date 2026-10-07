import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  type DashboardType,
  type WidgetCreateBody,
  type WidgetSchemas,
  type WidgetUpdateBody,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { useFeatureEnabled } from "@/utils/featureFlags";
import { dashboardKey } from "./useDashboards";

/** JSON Schemas of the registered widget types (backend is the source of
 *  truth). Drives the widget config form; cached indefinitely — the registry
 *  is static for a running server. Suspends until loaded so the editor pages
 *  render pure happy-path JSX under a `ResourceBoundary`. */
export function useWidgetSchemas({
  enabledOnly = false,
  dashboardType,
}: {
  enabledOnly?: boolean;
  /** Keeps only the types that fit this dashboard type, per the backend's
   *  `x-dashboard-types` on each schema. */
  dashboardType?: DashboardType;
} = {}): WidgetSchemas {
  const client = useGridoneClient();
  const synopticsEnabled = useFeatureEnabled("synoptics");
  const { data } = useSuspenseQuery<WidgetSchemas>({
    queryKey: ["dashboards", "widget-schemas"],
    queryFn: () => client.dashboards.getWidgetSchemas(),
    staleTime: Infinity,
  });
  // Creation hides disabled features and misfits; editing keeps the stored
  // type's schema so an existing widget can still be renamed after its
  // feature is disabled or its type stopped fitting the dashboard.
  return Object.fromEntries(
    Object.entries(data).filter(
      ([type, schema]) =>
        (!enabledOnly || type !== "synoptic" || synopticsEnabled) &&
        (dashboardType === undefined || fitsDashboard(schema, dashboardType)),
    ),
  );
}

/** Whether a widget schema declares the dashboard type among those it fits.
 *  A schema without the key (backend older than the UI) is kept. */
export function fitsDashboard(
  schema: Record<string, unknown>,
  dashboardType: DashboardType,
): boolean {
  const types = schema["x-dashboard-types"];
  return !Array.isArray(types) || types.includes(dashboardType);
}

function useWidgetErrorToast() {
  const { t } = useTranslation("common");
  return (error: Error) => {
    const detail = serverErrorMessage(error);
    const base = t("errors.default");
    toast.error(detail ? `${base}: ${detail}` : base);
  };
}

/** Add a widget to a dashboard; invalidates the dashboard document so the grid
 *  picks up the new widget (placed at the bottom by the backend). */
export function useAddWidget(dashboardId: string) {
  const { t } = useTranslation("dashboards");
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const onError = useWidgetErrorToast();

  const mutation = useMutation({
    mutationFn: (body: WidgetCreateBody) =>
      client.dashboards.addWidget(dashboardId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKey(dashboardId),
      });
      toast.success(t("widgets.addSuccess"));
    },
    onError,
  });

  return { addWidget: (body: WidgetCreateBody) => mutation.mutateAsync(body) };
}

/** Update a widget's config/envelope; a widget's `type` is immutable. */
export function useUpdateWidget(dashboardId: string) {
  const { t } = useTranslation("dashboards");
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const onError = useWidgetErrorToast();

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WidgetUpdateBody }) =>
      client.dashboards.updateWidget(dashboardId, id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKey(dashboardId),
      });
      toast.success(t("widgets.updateSuccess"));
    },
    onError,
  });

  return {
    updateWidget: (id: string, body: WidgetUpdateBody) =>
      mutation.mutateAsync({ id, body }),
  };
}

/** Remove a widget (its layout item goes with it, server-side). */
export function useRemoveWidget(dashboardId: string) {
  const { t } = useTranslation("dashboards");
  const client = useGridoneClient();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => client.dashboards.removeWidget(dashboardId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKey(dashboardId),
      });
      toast.success(t("widgets.deleteSuccess"));
    },
  });

  return {
    removeWidget: (
      id: string,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => mutation.mutateAsync(id, options),
  };
}
