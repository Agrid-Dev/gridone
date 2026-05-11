import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";

export type TransportFormCallbacks = {
  onCreated?: (transport: Transport) => void;
  onUpdated?: (transport: Transport) => void;
  onCancel?: () => void;
};

export const useTransportFormQueries = (callbacks: TransportFormCallbacks) => {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (payload: TransportCreatePayload) => createTransport(payload),
    onSuccess: (result: Transport) => {
      queryClient.invalidateQueries({ queryKey: ["transports"] });
      callbacks.onCreated?.(result);
    },
  });
  const updateMutation = useMutation({
    mutationFn: (payload: TransportUpdatePayload & { transportId: string }) =>
      updateTransport(payload.transportId, payload),
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
        ? (values: TransportUpdatePayload) =>
            updateMutation.mutateAsync({ ...values, transportId })
        : createMutation.mutateAsync;
    await mutate(values);
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
