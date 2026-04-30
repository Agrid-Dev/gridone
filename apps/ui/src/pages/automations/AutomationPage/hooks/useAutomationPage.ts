import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteAutomation,
  getAutomation,
  type Automation,
} from "@/api/automations";

export function useAutomation(automationId: string) {
  const { t } = useTranslation("automations");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const automation = useQuery<Automation>({
    queryKey: ["automations", automationId],
    queryFn: () => getAutomation(automationId),
    enabled: !!automationId,
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
    automation: automation.data,
    isLoading: automation.isLoading,
    remove: () => remove.mutate(),
    isDeleting: remove.isPending,
  };
}
