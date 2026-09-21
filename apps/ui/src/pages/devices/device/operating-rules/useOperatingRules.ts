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
  type OperatingRuleRetire,
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

export function useRetirement(
  initial: OperatingRule,
  schemas: OperatingRuleSchemas,
  onDone: () => void,
) {
  const client = useGridoneClient();
  const can = usePermissions();
  const queryClient = useQueryClient();
  const [rule, setRule] = useState(initial);
  const schema = useMemo(
    () =>
      (
        z.fromJSONSchema(schemas.retirement) as z.ZodType<
          OperatingRuleRetire,
          OperatingRuleRetire
        >
      ).refine((value) => !!value.reason.trim(), { path: ["reason"] }),
    [schemas],
  );
  const form = useForm<OperatingRuleRetire>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", revision: initial.revision ?? 1 },
  });
  const retire = useMutation({
    mutationFn: (body: OperatingRuleRetire) =>
      client.operatingRules.retire(rule.id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operatingRules"] });
      onDone();
    },
  });
  const reload = useMutation({
    mutationFn: async () => {
      const view = await client.operatingRules.get(rule.id);
      if (view.operating_rule.target.device_id !== initial.target.device_id)
        throw new ResourceNotFoundError();
      return view;
    },
    onSuccess: (view) => {
      setRule(view.operating_rule);
      form.setValue("revision", view.operating_rule.revision ?? 1);
      retire.reset();
    },
  });
  return {
    form,
    rule,
    retire,
    reload,
    submit: form.handleSubmit((body) => {
      if (
        can("operating_rules:write") &&
        !rule.retirement &&
        !isConflict(retire.error)
      )
        retire.mutate({ ...body, reason: body.reason.trim() });
    }),
  };
}
