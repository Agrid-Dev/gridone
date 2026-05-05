import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createAutomation,
  type Automation,
  type Trigger,
} from "@/api/automations";
import { createTemplate } from "@/api/commands";
import { type MetadataFormValues } from "../form/MetadataForm";
import type { ActionFormResult } from "../presenters/types";

export type WizardStep = "metadata" | "trigger" | "action";

export const WIZARD_STEPS: readonly WizardStep[] = [
  "metadata",
  "trigger",
  "action",
] as const;

export const DEFAULT_METADATA: MetadataFormValues = {
  name: "",
  description: "",
  enabled: true,
};

export function useCreateAutomation() {
  const { t } = useTranslation("automations");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState<WizardStep>("metadata");
  const [metadata, setMetadata] = useState<MetadataFormValues | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [action, setAction] = useState<ActionFormResult | null>(null);

  const { mutate, isPending } = useMutation({
    // Single chained mutation: inline actions create their backing template
    // first (with ``name: null`` to mark it ephemeral), then the automation
    // is created against the resolved templateId. Either step failing
    // surfaces as one error toast — the user sees a single attempt.
    mutationFn: async ({
      values,
      triggerValue,
      actionResult,
    }: {
      values: MetadataFormValues;
      triggerValue: Trigger;
      actionResult: ActionFormResult;
    }) => {
      const templateId = await resolveTemplateId(actionResult);
      return createAutomation({
        name: values.name,
        description: values.description,
        enabled: values.enabled,
        trigger: triggerValue,
        action: {
          providerId: "command_template",
          params: { templateId },
        },
      });
    },
    onSuccess: (automation: Automation) => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.created"));
      navigate(`/automations/${automation.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitMetadata = (values: MetadataFormValues) => {
    setMetadata(values);
    setCurrentStep("trigger");
  };

  const submitTrigger = (value: Trigger) => {
    setTrigger(value);
    setCurrentStep("action");
  };

  const submitAction = (result: ActionFormResult) => {
    if (!metadata || !trigger) return;
    setAction(result);
    mutate({ values: metadata, triggerValue: trigger, actionResult: result });
  };

  const goPrevious = () => {
    if (currentStep === "metadata") {
      navigate("/automations");
      return;
    }
    if (currentStep === "trigger") {
      setCurrentStep("metadata");
      return;
    }
    setCurrentStep("trigger");
  };

  return {
    currentStep,
    metadata,
    trigger,
    action,
    submitMetadata,
    submitTrigger,
    submitAction,
    goPrevious,
    isSubmitting: isPending,
  };
}

async function resolveTemplateId(result: ActionFormResult): Promise<string> {
  if (result.kind === "templateId") return result.templateId;
  const template = await createTemplate({ ...result.payload, name: null });
  return template.id;
}
