import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/api/apiError";
import {
  createTemplate,
  dispatchBatchCommand,
  dispatchSingleCommand,
  type AttributeValue,
  type CommandTemplate,
  type CommandTemplateCreatePayload,
} from "@/api/commands";
import type { DevicesFilter } from "@/api/devices";

export type DispatchResult =
  | { kind: "single" }
  | { kind: "batch"; batchId: string };

/** What the dispatch mutation accepts. Same shape as a template (target +
 *  write), without the name — we never need a name to dispatch. */
export type DispatchPayload = Omit<CommandTemplateCreatePayload, "name">;

export type UseCommandMutationsArgs = {
  onDispatched?: (result: DispatchResult) => void;
  onSaved?: (template: CommandTemplate) => void;
};

/** Wraps the dispatch + save-as-template HTTP calls. The hook is purely
 *  about firing payloads at the API and surfacing pending state — it knows
 *  nothing about wizard state, drafts, or form gating. Callers (the
 *  standalone command page) read whatever they need off their own state and
 *  pass payloads in.
 *
 *  Errors from either mutation surface through one shared toast; callbacks
 *  fire on success only. */
export function useCommandMutations({
  onDispatched,
  onSaved,
}: UseCommandMutationsArgs = {}) {
  const queryClient = useQueryClient();

  const dispatchMutation = useMutation<DispatchResult, Error, DispatchPayload>({
    mutationFn: (payload) => dispatch(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["commands"] });
      onDispatched?.(result);
    },
  });

  const saveMutation = useMutation<
    CommandTemplate,
    Error,
    CommandTemplateCreatePayload
  >({
    mutationFn: (payload) => createTemplate(payload),
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["command-templates"] });
      onSaved?.(template);
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

  return {
    dispatch: dispatchMutation.mutate,
    saveTemplate: saveMutation.mutate,
    isDispatching: dispatchMutation.isPending,
    isSaving: saveMutation.isPending,
  };
}

export type UseCommandMutationsOutput = ReturnType<typeof useCommandMutations>;

/** Routing decision for the dispatch HTTP call: a single-id, no-filter
 *  target hits the per-device endpoint; everything else (multi-id,
 *  by-filter, by-asset) goes through batch so the server resolves the
 *  membership at dispatch time. */
async function dispatch(payload: DispatchPayload): Promise<DispatchResult> {
  const { target, write } = payload;
  const attribute = write.attribute;
  const value = write.value as AttributeValue;

  if (isSingleDeviceTarget(target)) {
    await dispatchSingleCommand(target.ids![0], { attribute, value });
    return { kind: "single" };
  }

  const res = await dispatchBatchCommand({ attribute, value, target });
  return { kind: "batch", batchId: res.batchId };
}

function isSingleDeviceTarget(target: DevicesFilter): boolean {
  return (
    !!target.ids && target.ids.length === 1 && !target.types && !target.assetId
  );
}
