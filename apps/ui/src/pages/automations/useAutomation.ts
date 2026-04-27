import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteAutomation,
  disableAutomation,
  enableAutomation,
  getAutomation,
  listExecutions,
  type Automation,
  type AutomationExecution,
} from "@/api/automations";

/** All data + mutations the AutomationDetail page needs:
 *  the automation itself, its executions history, and the enable /
 *  disable / remove actions with their toast + navigation side
 *  effects. Mirrors `useTemplate` (commands/templates) so the page
 *  body stays focused on layout. */
export function useAutomation(automationId: string) {
  const { t } = useTranslation("automations");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const automation = useQuery<Automation>({
    queryKey: ["automations", automationId],
    queryFn: () => getAutomation(automationId),
    enabled: !!automationId,
  });

  const executions = useQuery<AutomationExecution[]>({
    queryKey: ["automations", automationId, "executions"],
    queryFn: () => listExecutions(automationId),
    enabled: !!automationId,
  });

  const enable = useMutation({
    mutationFn: () => enableAutomation(automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disable = useMutation({
    mutationFn: () => disableAutomation(automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
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
    executions: executions.data ?? [],
    enable: () => enable.mutate(),
    disable: () => disable.mutate(),
    isToggling: enable.isPending || disable.isPending,
    remove: () => remove.mutate(),
    isDeleting: remove.isPending,
  };
}
