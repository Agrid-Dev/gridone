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
  const [actionTemplateId, setActionTemplateId] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: ({
      values,
      triggerValue,
      templateId,
    }: {
      values: MetadataFormValues;
      triggerValue: Trigger;
      templateId: string;
    }) =>
      createAutomation({
        name: values.name,
        description: values.description,
        enabled: values.enabled,
        trigger: triggerValue,
        actionTemplateId: templateId,
      }),
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
    if (result.kind !== "templateId") {
      // ``inlineCommand`` lands in commit 3.
      throw new Error("inline command submit not implemented yet");
    }
    setActionTemplateId(result.templateId);
    mutate({
      values: metadata,
      triggerValue: trigger,
      templateId: result.templateId,
    });
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
    actionTemplateId,
    submitMetadata,
    submitTrigger,
    submitAction,
    goPrevious,
    isSubmitting: isPending,
  };
}
