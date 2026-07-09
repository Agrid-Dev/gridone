import type { AutomationUpdate, ProviderSchemas } from "@gridone/sdk";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useEditingSection } from "./useEditingSection";

const useToggleAutomation = (automationId: string) => {
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const { t } = useTranslation("automations");
  const { mutate: enable, isPending: isEnabling } = useMutation({
    mutationFn: () => client.automations.enable(automationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { mutate: disable, isPending: isDisabling } = useMutation({
    mutationFn: () => client.automations.disable(automationId),
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
  const client = useGridoneClient();
  const { t } = useTranslation("automations");
  const [submittingSection, setSubmittingSection] = useState<string | null>(
    null,
  );

  const { mutate } = useMutation({
    mutationFn: (payload: AutomationUpdate) =>
      client.automations.update(automationId, payload),
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
  const client = useGridoneClient();
  const canWrite = can("automations:write");
  const { data: triggerSchemas, isLoading } = useQuery<ProviderSchemas>({
    queryKey: ["automations-trigger-schemas"],
    queryFn: () => client.automations.getTriggerSchemas(),
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
