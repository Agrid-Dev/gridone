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
  type Protection,
  type ProtectionDefinition,
  type ProtectionRetire,
  type ProtectionSchemas,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { usePermissions } from "@/contexts/AuthContext";
import { useResourceNavigation } from "@/hooks/useResourceNavigation";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { ResourceNotFoundError } from "@/lib/errors";
import { definitionOf, emptyDefinition } from "./expressions";

export const protectionsPath = (deviceId: string) =>
  `/devices/${encodeURIComponent(deviceId)}/config/protections`;
export const protectionPath = (rule: Protection) =>
  `${protectionsPath(rule.target.device_id)}/${encodeURIComponent(rule.id)}`;
export const isConflict = (error: unknown) =>
  isGridoneError(error) && error.status === 409;

export function useProtections(deviceId: string) {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["protections", "list", deviceId],
    queryFn: () => client.protections.list(deviceId),
  });
}
export function useProtection(deviceId: string, protectionId: string) {
  const client = useGridoneClient();
  const query = useSuspenseQuery({
    queryKey: ["protections", "detail", protectionId],
    queryFn: () => client.protections.get(protectionId),
  });
  if (query.data.protection.target.device_id !== deviceId)
    throw new ResourceNotFoundError();
  return query;
}
export function useProtectionHistory(id: string) {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["protections", "history", id],
    queryFn: () => client.protections.history(id),
  });
}
export function useProtectionSchemas() {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["protections", "schemas"],
    queryFn: () => client.protections.schemas(),
    staleTime: Infinity,
  });
}
export function useProtectionDevices() {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["devices", undefined],
    queryFn: () => client.devices.list(),
    staleTime: 10_000,
  });
}

/** Derive structure from the server; model-validator whitespace rules need a UI check. */
export function definitionSchema(schemas: ProtectionSchemas) {
  return (
    z.fromJSONSchema(schemas.definition) as z.ZodType<
      ProtectionDefinition,
      ProtectionDefinition
    >
  ).superRefine((value, context) => {
    for (const key of ["name", "explanation"] as const) {
      if (!value[key].trim())
        context.addIssue({ code: "custom", path: [key], message: "required" });
    }
  });
}

export function useProtectionForm(
  deviceId: string,
  schemas: ProtectionSchemas,
  initial?: Protection,
) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const navigation = useResourceNavigation();
  const can = usePermissions();
  const [base, setBase] = useState(initial);
  const [latest, setLatest] = useState<Protection | null>(null);
  const [backup, setBackup] = useState<ProtectionDefinition | null>(null);
  const schema = useMemo(() => definitionSchema(schemas), [schemas]);
  const form = useForm<ProtectionDefinition>({
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
    mutationFn: (body: ProtectionDefinition) =>
      base
        ? client.protections.update(base.id, {
            ...body,
            revision: base.revision ?? 1,
          })
        : client.protections.create(body),
    onSuccess: async (rule) => {
      await queryClient.invalidateQueries({ queryKey: ["protections"] });
      form.reset(definitionOf(rule));
      navigation.open(protectionPath(rule), { replace: true });
    },
  });
  const reload = useMutation({
    mutationFn: async () => {
      const view = await client.protections.get(base!.id);
      if (view.protection.target.device_id !== deviceId)
        throw new ResourceNotFoundError();
      return view;
    },
    onSuccess: (view) => setLatest(view.protection),
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
        !can("protections:write") ||
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
  initial: Protection,
  schemas: ProtectionSchemas,
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
          ProtectionRetire,
          ProtectionRetire
        >
      ).refine((value) => !!value.reason.trim(), { path: ["reason"] }),
    [schemas],
  );
  const form = useForm<ProtectionRetire>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", revision: initial.revision ?? 1 },
  });
  const retire = useMutation({
    mutationFn: (body: ProtectionRetire) =>
      client.protections.retire(rule.id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["protections"] });
      onDone();
    },
  });
  const reload = useMutation({
    mutationFn: async () => {
      const view = await client.protections.get(rule.id);
      if (view.protection.target.device_id !== initial.target.device_id)
        throw new ResourceNotFoundError();
      return view;
    },
    onSuccess: (view) => {
      setRule(view.protection);
      form.setValue("revision", view.protection.revision ?? 1);
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
        can("protections:write") &&
        !rule.retirement &&
        !isConflict(retire.error)
      )
        retire.mutate({ ...body, reason: body.reason.trim() });
    }),
  };
}
