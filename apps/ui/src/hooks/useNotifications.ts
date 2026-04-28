import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  dismissNotification,
  listNotifications,
  type NotificationDispatch,
  type NotificationsFilter,
} from "@/api/notifications";
import type { Page } from "@/api/pagination";

export function useNotifications(filter?: NotificationsFilter) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("notifications");

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<Page<NotificationDispatch>>({
    queryKey: ["notifications", filter],
    queryFn: () => listNotifications(filter),
    refetchInterval: 10_000,
  });

  const { mutate: dismiss } = useMutation({
    mutationFn: dismissNotification,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  async function dismissMany(ids: string[]) {
    const results = await Promise.allSettled(ids.map(dismissNotification));
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      toast.error(
        t("notifications.bulkPartialFailure", { failed, total: ids.length }),
      );
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
