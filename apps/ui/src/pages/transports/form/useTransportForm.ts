import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  normalizeError,
  type Transport,
  type TransportCreate,
  type TransportProtocols,
  type TransportUpdate,
} from "@gridone/sdk";
import {
  reportOrphanedServerErrors,
  setServerFieldErrors,
} from "@/lib/forms/serverErrors";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  useSchemaForm,
  type SchemaFormValues,
} from "@/components/forms/schema-form";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";

/** Protocols the transport form offers. */
export const transportProtocols = [
  "mqtt",
  "http",
  "modbus-tcp",
  "bacnet",
  "knx",
  "webhook",
] as const satisfies readonly TransportProtocols[];

/** The subset of protocols the form can edit. */
export type FormProtocol = (typeof transportProtocols)[number];

/** UI view of `client.transports.getSchemas()`: config JSON schema keyed by
 *  protocol (the SDK types the payload loosely as untyped JSON objects). */
export type TransportSchemas = Record<string, Record<string, unknown>>;

type TransportFormValues = {
  name: string;
  protocol: TransportProtocols;
  config: Record<string, unknown>;
};

export type TransportFormCallbacks = {
  onCreated?: (transport: Transport) => void;
  onUpdated?: (transport: Transport) => void;
  onCancel?: () => void;
};

export const useTransportFormQueries = (callbacks: TransportFormCallbacks) => {
  const queryClient = useQueryClient();
  const client = useGridoneClient();

  const createMutation = useMutation({
    mutationFn: (payload: TransportFormValues) =>
      client.transports.create(payload as TransportCreate),
    onSuccess: (result: Transport) => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      callbacks.onCreated?.(result);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      transportId,
      ...payload
    }: TransportFormValues & { transportId: string }) => {
      const params: TransportUpdate = {
        name: payload.name,
        config: payload.config,
      };
      return client.transports.update(transportId, params);
    },
    onSuccess: (result: Transport) => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      callbacks.onUpdated?.(result);
    },
  });
  return {
    createMutation,
    updateMutation,
  };
};

export const useTransportConfigSchemas = () => {
  const client = useGridoneClient();
  const query = useQuery<TransportSchemas>({
    queryKey: ["transport-schemas"],
    queryFn: async () =>
      (await client.transports.getSchemas()) as TransportSchemas,
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
  options: TransportFormCallbacks & {
    lockedProtocol?: FormProtocol;
  } = {},
) => {
  const { lockedProtocol, ...callbacks } = options;
  const { createMutation, updateMutation } = useTransportFormQueries(callbacks);
  const { t } = useTranslation(["transports", "common"]);
  const isCreate = !currentTransport;
  const baseSchema = z.object({
    name: z.string().min(1),
    protocol: z.enum(transportProtocols),
  });
  const baseFormMethods = useForm<z.infer<typeof baseSchema>>({
    resolver: zodResolver(baseSchema),
    defaultValues: currentTransport
      ? {
          name: currentTransport.name,
          protocol: currentTransport.protocol as FormProtocol,
        }
      : lockedProtocol
        ? { protocol: lockedProtocol }
        : {},
  });
  const protocol = baseFormMethods.watch("protocol");
  const configJsonSchema =
    protocol && transportProtocols.includes(protocol)
      ? configSchemas[protocol]
      : undefined;
  const {
    form: configFormMethods,
    fields: configFields,
    defaultValues: configDefaults,
  } = useSchemaForm({
    schema: configJsonSchema,
    values: currentTransport?.config as SchemaFormValues | undefined,
  });
  useEffect(() => {
    if (transportProtocols.includes(protocol)) {
      // Re-seed the config values for the newly selected protocol's schema
      // (schema defaults, overlaid with the edited transport's config).
      configFormMethods.reset(configDefaults);
    }
  }, [protocol]);
  const handleSubmit = async () => {
    const values = {
      ...baseFormMethods.getValues(),
      config: configFormMethods.getValues(),
    };
    const [okBase, okConfig] = await Promise.all([
      baseFormMethods.trigger(),
      configFormMethods.trigger(),
    ]);
    if (!okBase || !okConfig) return;
    const transportId = currentTransport?.id; // discriminates between edit and create
    const mutate =
      transportId !== undefined
        ? (values: TransportFormValues) =>
            updateMutation.mutateAsync({ ...values, transportId })
        : createMutation.mutateAsync;
    try {
      await mutate(values);
    } catch (error) {
      // The modal stays open so the user can adjust and retry.
      applyServerError(error);
      return;
    }
    return values;
  };
  /**
   * ADR 0002 error handling, composed over the form's two-RHF-instance split
   * (hand-written base fields + schema-driven config): validation errors try
   * the config fields first, then the base fields; anything the user can't
   * see on a field surfaces as a toast.
   */
  const applyServerError = (error: unknown) => {
    const normalized = normalizeError(error);
    if (normalized.kind === "fieldErrors") {
      const orphans = setServerFieldErrors(
        baseFormMethods,
        setServerFieldErrors(configFormMethods, normalized.errors),
      );
      reportOrphanedServerErrors(orphans);
      if (orphans.length > 0) {
        toast.error(t("saveFailed"));
      }
      return;
    }
    toast.error(
      normalized.kind === "message"
        ? `${t("saveFailed")}: ${normalized.message}`
        : t("saveFailed"),
    );
  };
  const handleCancel = () => callbacks.onCancel?.();
  return {
    isCreate,
    handleSubmit,
    handleCancel,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    baseFormMethods,
    configFormMethods,
    configFields,
    lockedProtocol,
  };
};
