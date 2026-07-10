import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Automation } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/**
 * Fetches the automation under Suspense — an unknown id propagates as
 * `GridoneError(404)` to the nearest `ResourceBoundary`, so `automation` is
 * always defined here.
 */
export function useAutomation(automationId: string) {
  const { t } = useTranslation("automations");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const client = useGridoneClient();

  const { data: automation } = useSuspenseQuery<Automation>({
    queryKey: ["automations", automationId],
    queryFn: () => client.automations.get(automationId),
  });

  const remove = useMutation({
    mutationFn: () => client.automations.delete(automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.removeQueries({ queryKey: ["automations", automationId] });
      toast.success(t("toasts.deleted"));
      navigate("/automations");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    automation,
    remove: () => remove.mutate(),
    isDeleting: remove.isPending,
  };
}
