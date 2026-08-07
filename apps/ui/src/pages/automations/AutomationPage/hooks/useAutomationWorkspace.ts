import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type {
  Action,
  Automation,
  AutomationUpdate,
  Trigger,
} from "@gridone/sdk";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

const identitySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
});

export type IdentityValues = z.infer<typeof identitySchema>;

/**
 * State behind the always-editable automation page: the identity form plus the
 * trigger and action drafts their sub-forms report as the user types, all
 * committed by a single Save. Toggling enabled stays immediate — it is a
 * status, not a pending edit.
 */
export function useAutomationWorkspace(
  automationId: string,
  automation: Automation,
) {
  const can = usePermissions();
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { t } = useTranslation("automations");

  const identityForm = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    mode: "onChange",
    defaultValues: {
      name: automation.name,
      description: automation.description ?? "",
    },
  });

  const [trigger, setTrigger] = useState<Trigger | null>(automation.trigger);
  const [action, setAction] = useState<Action | null>(automation.action);
  // Bumped on cancel so the trigger and action sub-forms remount on their
  // saved values — they own their own react-hook-form state.
  const [draftKey, setDraftKey] = useState(0);
  const [serverError, setServerError] = useState<unknown>(undefined);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["automations"] });
  };

  const { mutate: mutateUpdate, isPending: isSaving } = useMutation({
    mutationFn: (payload: AutomationUpdate) =>
      client.automations.update(automationId, payload),
    onSuccess: (_data, payload) => {
      setServerError(undefined);
      invalidate();
      identityForm.reset({
        name: payload.name ?? automation.name,
        description: payload.description ?? "",
      });
      toast.success(t("toasts.updated"));
    },
    onError: (error: Error) => {
      setServerError(error);
      toast.error(serverErrorMessage(error) ?? t("toasts.saveError"));
    },
  });

  const enabled = automation.enabled ?? true;
  const { mutate: mutateToggle, isPending: isToggling } = useMutation({
    mutationFn: () =>
      enabled
        ? client.automations.disable(automationId)
        : client.automations.enable(automationId),
    onSuccess: () => {
      invalidate();
      toast.success(t(enabled ? "toasts.disabled" : "toasts.enabled"));
    },
    onError: (error: Error) =>
      toast.error(serverErrorMessage(error) ?? t("toasts.saveError")),
  });

  const save = identityForm.handleSubmit((values) => {
    if (!trigger || !action) return;
    mutateUpdate({
      name: values.name.trim(),
      description: values.description,
      trigger,
      action,
    });
  });

  const cancel = () => {
    identityForm.reset();
    setTrigger(automation.trigger);
    setAction(automation.action);
    setServerError(undefined);
    setDraftKey((key) => key + 1);
  };

  const hasChanges =
    identityForm.formState.isDirty ||
    !sameShape(trigger, automation.trigger) ||
    !sameShape(action, automation.action);

  return {
    canWrite: can("automations:write"),
    identityForm,
    draftKey,
    // Sub-forms report through `useDraftReport`, whose effect keys off the
    // callback identity — the raw setters are already stable.
    onTriggerChange: setTrigger,
    onActionChange: setAction,
    enabled,
    toggle: useCallback(() => mutateToggle(), [mutateToggle]),
    isToggling,
    save,
    cancel,
    isSaving,
    hasChanges,
    canSave: hasChanges && trigger !== null && action !== null,
    serverError,
  };
}

/** Structural comparison that ignores key order: the API's JSON and the object
 *  a form body rebuilds carry the same fields, not necessarily in the same
 *  order, and an order-sensitive diff would leave Save permanently enabled. */
function sameShape(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : entry,
  );
}
