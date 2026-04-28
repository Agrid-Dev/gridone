import {
  listTriggerSchemas,
  TriggerSchema,
  enableAutomation,
  disableAutomation,
} from "@/api/automations";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useEditingSection } from "./useEditingSection";

const useToggleAutomation = (automationId: string) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation("automations");
  const { mutate: enable, isPending: isEnabling } = useMutation({
    mutationFn: () => enableAutomation(automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { mutate: disable, isPending: isDisabling } = useMutation({
    mutationFn: () => disableAutomation(automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return { enable, disable, isToggling: isEnabling || isDisabling };
};

export const useAutomationEdit = (automationId: string) => {
  const can = usePermissions();
  const canWrite = can("automations:write");
  const { data: triggerSchemas, isLoading } = useQuery<
    Record<string, TriggerSchema>
  >({
    queryKey: ["automations-trigger-schemas"],
    queryFn: listTriggerSchemas,
  });

  return {
    triggerSchemas,
    isLoading,
    canWrite,
    ...useEditingSection(),
    ...useToggleAutomation(automationId),
  };
};
