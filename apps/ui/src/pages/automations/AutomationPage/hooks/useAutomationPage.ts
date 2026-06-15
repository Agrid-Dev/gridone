import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteAutomation,
  getAutomation,
  type Automation,
} from "@/api/automations";

/**
 * Fetches the automation under Suspense — an unknown id propagates as
 * `ApiError(404)` to the nearest `ResourceBoundary`, so `automation` is always
 * defined here.
 */
export function useAutomation(automationId: string) {
  const { t } = useTranslation("automations");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: automation } = useSuspenseQuery<Automation>({
    queryKey: ["automations", automationId],
    queryFn: () => getAutomation(automationId),
  });

  const remove = useMutation({
    mutationFn: () => deleteAutomation(automationId),
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
