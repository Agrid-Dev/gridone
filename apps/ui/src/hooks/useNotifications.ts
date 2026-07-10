import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  NotificationDispatch,
  NotificationListParams,
  Page,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useNotifications(filter?: NotificationListParams) {
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const { t } = useTranslation("notifications");

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<Page<NotificationDispatch>>({
    queryKey: ["notifications", filter],
    queryFn: () => client.notifications.list(filter),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const { mutate: dismiss } = useMutation({
    mutationFn: (id: string) => client.notifications.dismiss(id),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  async function dismissMany(ids: string[]) {
    const results = await Promise.allSettled(
      ids.map((id) => client.notifications.dismiss(id)),
    );
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(t("bulkPartialFailure", { failed, total: ids.length }));
    }
  }

  return {
    page: data,
    loading: isLoading,
    error: queryError ?? null,
    dismiss,
    dismissMany,
  };
}
