import { useMemo, useState } from "react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  isGridoneError,
  type OperatingRule,
  type OperatingRuleDefinition,
  type OperatingRuleSchemas,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { ResourceNotFoundError } from "@/lib/errors";
import { definitionOf, emptyDefinition } from "./expressions";

export const operatingRulesPath = (deviceId: string) =>
  `/devices/${encodeURIComponent(deviceId)}/config/operating-rules`;
export const operatingRulePath = (rule: OperatingRule) =>
  `${operatingRulesPath(rule.target.device_id)}/${encodeURIComponent(rule.id)}`;
export const isConflict = (error: unknown) =>
  isGridoneError(error) && error.status === 409;

export function useOperatingRules(deviceId: string) {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["operatingRules", "list", deviceId],
    queryFn: () => client.operatingRules.list(deviceId),
  });
}
export function useOperatingRule(deviceId: string, operatingRuleId: string) {
  const client = useGridoneClient();
  const query = useSuspenseQuery({
    queryKey: ["operatingRules", "detail", operatingRuleId],
    queryFn: () => client.operatingRules.get(operatingRuleId),
  });
  if (query.data.operating_rule.target.device_id !== deviceId)
    throw new ResourceNotFoundError();
  return query;
}
export function useOperatingRuleHistory(id: string) {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["operatingRules", "history", id],
    queryFn: () => client.operatingRules.history(id),
  });
}
export function useOperatingRuleSchemas() {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["operatingRules", "schemas"],
    queryFn: () => client.operatingRules.schemas(),
    staleTime: Infinity,
  });
}
export function useOperatingRuleDevices() {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["devices", undefined],
    queryFn: () => client.devices.list(),
    staleTime: 10_000,
  });
}

/** Derive structure from the server; model-validator whitespace rules need a UI check. */
export function definitionSchema(schemas: OperatingRuleSchemas) {
  return (
    z.fromJSONSchema(schemas.definition) as z.ZodType<
      OperatingRuleDefinition,
      OperatingRuleDefinition
    >
  ).superRefine((value, context) => {
    for (const key of ["name", "explanation"] as const) {
      if (!value[key].trim())
        context.addIssue({ code: "custom", path: [key], message: "required" });
    }
  });
}

export function useOperatingRuleForm(
  deviceId: string,
  schemas: OperatingRuleSchemas,
  initial?: OperatingRule,
) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const navigation = useResourceNavigation();
  const can = usePermissions();
  const [base, setBase] = useState(initial);
  const [latest, setLatest] = useState<OperatingRule | null>(null);
  const [backup, setBackup] = useState<OperatingRuleDefinition | null>(null);
  const schema = useMemo(() => definitionSchema(schemas), [schemas]);
  const form = useForm<OperatingRuleDefinition>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? definitionOf(initial)
      : {
          ...emptyDefinition(),
          target: { device_id: deviceId, attribute: "", value: true },
        },
  });
  useUnsavedChangesWarning(form.formState.isDirty);
  const save = useMutation({
    mutationFn: (body: OperatingRuleDefinition) =>
      base
        ? client.operatingRules.update(base.id, {
            ...body,
            revision: base.revision ?? 1,
          })
        : client.operatingRules.create(body),
    onSuccess: async (rule) => {
      await queryClient.invalidateQueries({ queryKey: ["operatingRules"] });
      form.reset(definitionOf(rule));
      navigation.open(operatingRulePath(rule), { replace: true });
    },
  });
  const reload = useMutation({
    mutationFn: async () => {
      const view = await client.operatingRules.get(base!.id);
      if (view.operating_rule.target.device_id !== deviceId)
        throw new ResourceNotFoundError();
      return view;
    },
    onSuccess: (view) => setLatest(view.operating_rule),
  });
  const useLatest = () => {
    if (!latest) return;
    setBackup(form.getValues());
    form.reset(definitionOf(latest));
    setBase(latest);
    setLatest(null);
    save.reset();
  };
  const keepDraft = () => {
    if (!latest || latest.retirement) return;
    setBase(latest);
    setLatest(null);
    save.reset();
  };
  return {
    form,
    base,
    latest,
    backup,
    save,
    reload,
    useLatest,
    keepDraft,
    restoreDraft: () => {
      if (backup) {
        form.reset(backup, { keepDefaultValues: true });
        setBackup(null);
      }
    },
    submit: form.handleSubmit((body) => {
      if (
        !can("operating_rules:write") ||
        base?.retirement ||
        isConflict(save.error)
      )
        return;
      save.mutate({
        ...body,
        name: body.name.trim(),
        explanation: body.explanation.trim(),
        target: { ...body.target, device_id: deviceId },
      });
    }),
  };
}

/** Lifecycle changes use the displayed revision; conflicts require an explicit reload. */
export function useOperatingRuleActions(rule: OperatingRule) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const navigation = useResourceNavigation();
  const can = usePermissions();
  const [deleting, setDeleting] = useState(false);
  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) =>
      client.operatingRules.setEnabled(rule.id, {
        enabled,
        revision: rule.revision ?? 1,
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["operatingRules", "detail", rule.id], {
        operating_rule: saved,
        reasons: [],
      });
      await queryClient.invalidateQueries({ queryKey: ["operatingRules"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => client.operatingRules.delete(rule.id, rule.revision ?? 1),
    onSuccess: () => {
      setDeleting(false);
      navigation.open(operatingRulesPath(rule.target.device_id), {
        replace: true,
      });
      void queryClient.invalidateQueries({
        queryKey: ["operatingRules", "list"],
      });
      queryClient.removeQueries({
        queryKey: ["operatingRules", "detail", rule.id],
      });
      queryClient.removeQueries({
        queryKey: ["operatingRules", "history", rule.id],
      });
    },
  });
  const reload = useMutation({
    mutationFn: async () => {
      const view = await client.operatingRules.get(rule.id);
      if (view.operating_rule.target.device_id !== rule.target.device_id)
        throw new ResourceNotFoundError();
      return view;
    },
    onSuccess: (view) => {
      queryClient.setQueryData(["operatingRules", "detail", rule.id], view);
      void queryClient.invalidateQueries({
        queryKey: ["operatingRules", "history", rule.id],
      });
      setEnabled.reset();
      remove.reset();
      setDeleting(false);
    },
  });
  const pending = setEnabled.isPending || remove.isPending || reload.isPending;
  const conflict = isConflict(setEnabled.error) || isConflict(remove.error);
  const locked = pending || conflict || !can("operating_rules:write");
  return {
    deleting,
    setDeleting: (open: boolean) => {
      if (pending) return;
      setDeleting(open);
      if (!open && !conflict) remove.reset();
    },
    pending,
    locked,
    conflict,
    error: reload.error ?? remove.error ?? setEnabled.error,
    reload: () => reload.mutate(),
    toggle: () => {
      if (!locked) setEnabled.mutate(!isOperatingRuleEnabled(rule));
    },
    remove: () => {
      if (!locked) remove.mutate();
    },
  };
}

export const isOperatingRuleEnabled = (rule: OperatingRule) =>
  rule.enabled !== false && !rule.retirement;
