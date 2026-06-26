import {
  listTriggerSchemas,
  TriggerSchema,
  enableAutomation,
  disableAutomation,
  updateAutomation,
  type AutomationUpdate,
} from "@/api/automations";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useEditingSection } from "@/hooks/useEditingSection";

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

const useUpdateAutomation = (automationId: string, onUpdated?: () => void) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation("automations");
  const [submittingSection, setSubmittingSection] = useState<string | null>(
    null,
  );

  const { mutate } = useMutation({
    mutationFn: (payload: AutomationUpdate) =>
      updateAutomation(automationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.updated"));
      onUpdated?.();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => setSubmittingSection(null),
  });

  const update = (section: string, payload: AutomationUpdate) => {
    setSubmittingSection(section);
    mutate(payload);
  };

  return { update, submittingSection };
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

  const editing = useEditingSection();
  const { update, submittingSection } = useUpdateAutomation(automationId, () =>
    editing.setEditingSection(null),
  );

  return {
    triggerSchemas,
    isLoading,
    canWrite,
    update,
    submittingSection,
    ...editing,
    ...useToggleAutomation(automationId),
  };
};
