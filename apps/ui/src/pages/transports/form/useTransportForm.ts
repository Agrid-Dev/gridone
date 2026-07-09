import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  createTransport,
  updateTransport,
  getTransportSchemas,
  Transport,
  TransportProtocol,
  transportProtocols,
  type TransportCreatePayload,
  type TransportUpdatePayload,
  type TransportSchemas,
} from "@/api/transports";
import { isApiError } from "@/api/apiError";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";

export type TransportFormCallbacks = {
  onCreated?: (transport: Transport) => void;
  onUpdated?: (transport: Transport) => void;
  onCancel?: () => void;
};

const isBlank = (value: unknown): boolean =>
  !value ||
  (typeof value === "object" && Object.values(value).every((v) => !v));

export const useTransportFormQueries = (callbacks: TransportFormCallbacks) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(["transports", "common"]);

  const reportError = (error: unknown) => {
    const detail = isApiError(error)
      ? error.details || error.message
      : error instanceof Error
        ? error.message
        : null;
    const base = t("saveFailed");
    toast.error(detail ? `${base}: ${detail}` : base);
  };

  const createMutation = useMutation({
    mutationFn: (payload: TransportCreatePayload) => createTransport(payload),
    onSuccess: (result: Transport) => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      callbacks.onCreated?.(result);
    },
    onError: reportError,
  });
  const updateMutation = useMutation({
    mutationFn: (payload: TransportUpdatePayload & { transportId: string }) =>
      updateTransport(payload.transportId, payload),
    onSuccess: (result: Transport) => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      callbacks.onUpdated?.(result);
    },
    onError: reportError,
  });
  return {
    createMutation,
    updateMutation,
  };
};

export const useTransportConfigSchemas = () => {
  const query = useQuery<TransportSchemas>({
    queryKey: ["transport-schemas"],
    queryFn: getTransportSchemas,
    staleTime: 60000,
  });
  return {
    isLoading: query.isLoading,
    configSchemas: query.data,
  };
};

export const useTransportForm = (
  configSchemas: TransportSchemas,
  currentTransport: Transport | undefined,
  options: TransportFormCallbacks & { lockedProtocol?: TransportProtocol } = {},
) => {
  const { lockedProtocol, ...callbacks } = options;
  const { createMutation, updateMutation } = useTransportFormQueries(callbacks);
  const isCreate = !currentTransport;
  const baseSchema = z.object({
    name: z.string().min(1),
    protocol: z.enum(transportProtocols),
  });
  const baseFormMethods = useForm<z.infer<typeof baseSchema>>({
    resolver: zodResolver(baseSchema),
    defaultValues:
      currentTransport ?? (lockedProtocol ? { protocol: lockedProtocol } : {}),
  });
  const protocol = baseFormMethods.watch("protocol");
  const configJsonSchema =
    protocol && transportProtocols.includes(protocol)
      ? configSchemas[protocol]
      : { required: [], properties: {} };
  const configZodSchema = z.fromJSONSchema(configJsonSchema) as z.ZodObject;
  const configFormMethods = useForm<z.infer<typeof configZodSchema>>({
    resolver: zodResolver(configZodSchema),
    defaultValues: currentTransport?.config ?? {},
  });

  const secretFieldNames = Object.entries(
    configJsonSchema.properties ?? {},
  ).flatMap(([name, prop]) => (prop.secret ? [name] : []));
  const configuredSecrets = currentTransport?.configuredSecrets ?? [];
  // Secrets the user has chosen to replace this session. Reset on protocol
  // change so a switch never carries a stale "revealed" state.
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(
    () => new Set(),
  );
  const revealSecret = (name: string) =>
    setRevealedSecrets((prev) => new Set(prev).add(name));
  const cancelReveal = (name: string) =>
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });

  useEffect(() => {
    if (transportProtocols.includes(protocol)) {
      configFormMethods.reset();
      setRevealedSecrets(new Set());
    }
  }, [protocol]);
  const handleSubmit = async () => {
    const config: Record<string, unknown> = {
      ...configFormMethods.getValues(),
    };
    // Write-only secret rules mirrored client-side: a configured secret left
    // untouched is omitted (server preserves it); an empty value is omitted
    // (never wipe); a typed value is sent. A structured secret (e.g. KNX's
    // secure_credentials) counts as empty when every sub-field is blank.
    for (const name of secretFieldNames) {
      const untouched =
        configuredSecrets.includes(name) && !revealedSecrets.has(name);
      const empty = isBlank(config[name]);
      if (untouched || empty) delete config[name];
    }
    const values = {
      ...baseFormMethods.getValues(),
      config,
    };
    const [okBase, okConfig] = await Promise.all([
      baseFormMethods.trigger(),
      configFormMethods.trigger(),
    ]);
    if (!okBase || !okConfig) return;
    const transportId = currentTransport?.id; // discriminates between edit and create
    const mutate =
      transportId !== undefined
        ? (values: TransportUpdatePayload) =>
            updateMutation.mutateAsync({ ...values, transportId })
        : createMutation.mutateAsync;
    try {
      await mutate(values);
    } catch {
      // onError handler in useTransportFormQueries already surfaces a toast.
      // Swallow here so the rejection doesn't bubble as an unhandled promise;
      // the modal stays open so the user can adjust and retry.
      return;
    }
    return values;
  };
  const handleCancel = () => callbacks.onCancel?.();
  return {
    isCreate,
    handleSubmit,
    handleCancel,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    baseFormMethods,
    configFormMethods,
    jsonSchema: configSchemas[protocol],
    lockedProtocol,
    configuredSecrets,
    revealedSecrets,
    revealSecret,
    cancelReveal,
  };
};
