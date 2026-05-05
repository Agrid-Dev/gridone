import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import {
  createTemplate,
  dispatchBatchCommand,
  dispatchSingleCommand,
  type AttributeValue,
  type CommandTemplate,
} from "@/api/commands";
import type { Device, DevicesFilter } from "@/api/devices";
import type { CommandWizardState } from "./useCommandWizard";
import type { WizardFormValues } from "./types";

export type DispatchResult =
  | { kind: "single" }
  | { kind: "batch"; batchId: string };

export type UseCommandMutationsArgs = {
  /** The form-progression hook's state. The mutations hook reads
   *  ``selectedDevices`` / ``effectiveTarget`` / ``getValues`` and clears the
   *  draft after a successful write. */
  wizard: CommandWizardState;
  onDispatched: (result: DispatchResult) => void;
  onSaved: (template: CommandTemplate) => void;
};

/** Wraps the dispatch + save-as-template mutations the standalone wizard
 *  needs. The inline action form skips this hook entirely — its submit
 *  bubbles a payload up to the automation form's own mutation chain. */
export function useCommandMutations({
  wizard,
  onDispatched,
  onSaved,
}: UseCommandMutationsArgs) {
  const queryClient = useQueryClient();

  const dispatchMutation = useMutation<DispatchResult, Error, WizardFormValues>(
    {
      mutationFn: (v) =>
        dispatch(v, wizard.selectedDevices, wizard.effectiveTarget),
      onSuccess: (result) => {
        wizard.clearDraft();
        queryClient.invalidateQueries({ queryKey: ["commands"] });
        onDispatched(result);
      },
    },
  );

  const saveMutation = useMutation<CommandTemplate, Error, WizardFormValues>({
    mutationFn: (v) => saveTemplate(v, wizard.effectiveTarget),
    onSuccess: (template) => {
      wizard.clearDraft();
      queryClient.invalidateQueries({ queryKey: ["command-templates"] });
      onSaved(template);
    },
  });

  // Error toasts (dispatch + save share the same surface). Fires once per
  // distinct error instance.
  const error = dispatchMutation.error ?? saveMutation.error;
  useEffect(() => {
    if (!error) return;
    const detail =
      error instanceof ApiError ? error.detail || error.message : error.message;
    toast.error(String(detail));
  }, [error]);

  // The save-button gating depends on wizard state + a non-empty name.
  const templateName = (wizard.values.templateName ?? "").trim();
  const canSave =
    templateName.length > 0 &&
    !saveMutation.isPending &&
    wizard.selectedDevices.length > 0 &&
    wizard.commandValid;
  const canDispatch =
    !dispatchMutation.isPending &&
    wizard.selectedDevices.length > 0 &&
    wizard.commandValid;

  return {
    handleDispatch: () => dispatchMutation.mutate(wizard.getValues()),
    handleSave: () => saveMutation.mutate(wizard.getValues()),
    isDispatching: dispatchMutation.isPending,
    isSaving: saveMutation.isPending,
    canDispatch,
    canSave,
  };
}

async function dispatch(
  v: WizardFormValues,
  selectedDevices: Device[],
  target: DevicesFilter,
): Promise<DispatchResult> {
  if (!v.attribute || v.value === undefined) {
    throw new Error("Form incomplete");
  }
  if (selectedDevices.length === 0) {
    throw new Error("No devices selected");
  }
  const attribute = v.attribute;
  const value = v.value as AttributeValue;

  // Single-device fast path: one explicit id in the target and no other
  // filter. Everything else goes through the batch endpoint so the server
  // resolves at dispatch time (important for asset-based targets).
  if (
    target.ids &&
    target.ids.length === 1 &&
    !target.types &&
    !target.assetId
  ) {
    await dispatchSingleCommand(target.ids[0], { attribute, value });
    return { kind: "single" };
  }

  const res = await dispatchBatchCommand({ attribute, value, target });
  return { kind: "batch", batchId: res.batchId };
}

async function saveTemplate(
  v: WizardFormValues,
  target: DevicesFilter,
): Promise<CommandTemplate> {
  if (!v.attribute || v.value === undefined || !v.attributeDataType) {
    throw new Error("Form incomplete");
  }
  const name = (v.templateName ?? "").trim();
  if (!name) {
    throw new Error("Template name required");
  }
  return createTemplate({
    target,
    write: {
      attribute: v.attribute,
      value: v.value as AttributeValue,
      dataType: v.attributeDataType,
    },
    name,
  });
}

export type UseCommandMutationsOutput = ReturnType<typeof useCommandMutations>;
