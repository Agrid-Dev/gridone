import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  isGridoneError,
  type Transport,
  type TransportCreate,
  type TransportProtocols,
  type TransportUpdate,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
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
] as const satisfies readonly TransportProtocols[];

/** The subset of protocols the form can edit. */
export type FormProtocol = (typeof transportProtocols)[number];

export type JsonSchemaProperty = {
  type?: "string" | "number" | "integer" | "boolean" | "object";
  title?: string;
  description?: string;
  default?: string | number | boolean | null;
  enum?: Array<string | number>;
  anyOf?: JsonSchemaProperty[];
  oneOf?: JsonSchemaProperty[];
  multiline?: boolean;
};

export type TransportSchema = {
  title?: string;
  type?: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

/** UI view of `client.transports.getSchemas()`: config JSON schema keyed by
 *  protocol (the SDK types the payload loosely as untyped JSON objects). */
export type TransportSchemas = Record<string, TransportSchema>;

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
  const { t } = useTranslation(["transports", "common"]);

  const reportError = (error: unknown) => {
    const detail = isGridoneError(error)
      ? error.detail
      : error instanceof Error
        ? error.message
        : null;
    const base = t("saveFailed");
    toast.error(detail ? `${base}: ${detail}` : base);
  };

  const createMutation = useMutation({
    mutationFn: (payload: TransportFormValues) =>
      client.transports.create(payload as TransportCreate),
    onSuccess: (result: Transport) => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      callbacks.onCreated?.(result);
    },
    onError: reportError,
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
    onError: reportError,
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
      : { required: [] };
  const configZodSchema = z.fromJSONSchema(configJsonSchema) as z.ZodObject;
  const configFormMethods = useForm<z.infer<typeof configZodSchema>>({
    resolver: zodResolver(configZodSchema),
    defaultValues: currentTransport?.config ?? {},
  });
  useEffect(() => {
    if (transportProtocols.includes(protocol)) {
      configFormMethods.reset();
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
  };
};
