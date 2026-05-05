import {
  listTriggerSchemas,
  TriggerSchema,
  enableAutomation,
  disableAutomation,
  updateAutomation,
  type Automation,
  type AutomationUpdate,
} from "@/api/automations";
import { createTemplate } from "@/api/commands";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useEditingSection } from "./useEditingSection";
import type { ActionFormResult } from "../presenters/types";

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

  const onMutationSuccess = (): Automation | void => {
    queryClient.invalidateQueries({ queryKey: ["automations"] });
    toast.success(t("toasts.updated"));
    onUpdated?.();
  };

  const onMutationError = (err: Error) => toast.error(err.message);
  const onMutationSettled = () => setSubmittingSection(null);

  // Plain field update (metadata, trigger, enabled). Action edits go through
  // the chained mutation below since they may need to create a backing
  // template before the PATCH.
  const fieldUpdate = useMutation({
    mutationFn: (payload: AutomationUpdate) =>
      updateAutomation(automationId, payload),
    onSuccess: onMutationSuccess,
    onError: onMutationError,
    onSettled: onMutationSettled,
  });

  // Action update: when ``inlineCommand``, save the template (with
  // ``name: null``) first and then PATCH the automation against the
  // resolved template id. Either step failing surfaces as one error toast.
  const actionUpdate = useMutation({
    mutationFn: async (result: ActionFormResult) => {
      const templateId = await resolveTemplateId(result);
      return updateAutomation(automationId, {
        action: {
          providerId: "command_template",
          params: { templateId },
        },
      });
    },
    onSuccess: onMutationSuccess,
    onError: onMutationError,
    onSettled: onMutationSettled,
  });

  const updateField = (section: string, payload: AutomationUpdate) => {
    setSubmittingSection(section);
    fieldUpdate.mutate(payload);
  };

  const updateAction = (result: ActionFormResult) => {
    setSubmittingSection("action");
    actionUpdate.mutate(result);
  };

  return { updateField, updateAction, submittingSection };
};

async function resolveTemplateId(result: ActionFormResult): Promise<string> {
  if (result.kind === "templateId") return result.templateId;
  const template = await createTemplate({ ...result.payload, name: null });
  return template.id;
}

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
  const { updateField, updateAction, submittingSection } = useUpdateAutomation(
    automationId,
    () => editing.setEditingSection(null),
  );

  return {
    triggerSchemas,
    isLoading,
    canWrite,
    updateField,
    updateAction,
    submittingSection,
    ...editing,
    ...useToggleAutomation(automationId),
  };
};
