import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  isGridoneError,
  type WidgetCreateBody,
  type WidgetUpdateBody,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { dashboardKey } from "./useDashboards";

function useWidgetErrorToast() {
  const { t } = useTranslation("common");
  return (error: Error) => {
    const detail = isGridoneError(error) ? error.detail : error.message;
    toast.error(`${t("errors.default")}: ${detail}`);
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
  const onError = useWidgetErrorToast();

  const mutation = useMutation({
    mutationFn: (id: string) => client.dashboards.removeWidget(dashboardId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKey(dashboardId),
      });
      toast.success(t("widgets.deleteSuccess"));
    },
    onError,
  });

  return { removeWidget: (id: string) => mutation.mutateAsync(id) };
}
