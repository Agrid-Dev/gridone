import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  GridoneError,
  normalizeError,
  type ValidationErrorItem,
  type Transport,
  type TransportCreate,
  type TransportProtocols,
  type TransportUpdate,
} from "@gridone/sdk";
import {
  applyServerFieldErrors,
  normalizeServerErrorLocation,
  useClearServerErrorOnChange,
} from "@/components/forms/schema-form";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  emptyOptionalsToNull,
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
  useClearServerErrorOnChange(baseFormMethods);
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
    // Validate through RHF's handleSubmit (not trigger()): it flips
    // `isSubmitted`, so the default reValidateMode "onChange" clears a
    // rejected field's error as the user corrects it — trigger() kept
    // stale errors until the next click.
    let okBase = false;
    let okConfig = false;
    await baseFormMethods.handleSubmit(() => {
      okBase = true;
    })();
    await configFormMethods.handleSubmit(() => {
      okConfig = true;
    })();
    if (!okBase || !okConfig) return;
    const values = {
      ...baseFormMethods.getValues(),
      // Cleared optional inputs hold "" — send an explicit null so the
      // backend unsets them (PATCH merges: an absent key keeps the old
      // value, and "" would store a blank credential).
      config: emptyOptionalsToNull(configFormMethods.getValues(), configFields),
    };
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
  /** Route endpoint-relative errors across the form's two RHF instances. */
  const applyServerError = (error: unknown) => {
    const normalized = normalizeError(error);
    // Unsupported fields render no FieldError — an error mapped onto one
    // would vanish; leaving them out routes it to the root banner.
    const configFieldNames = configFields
      .filter((field) => field.kind !== "unsupported")
      .map((field) => field.name);
    const fallbackMessage = t("saveFailed");
    const toastMessage = (serverMessage: string | undefined) =>
      serverMessage ? `${fallbackMessage}: ${serverMessage}` : fallbackMessage;
    const sharedOptions = { fallbackMessage, toastMessage };

    if (normalized.kind === "fieldErrors") {
      const configErrors: ValidationErrorItem[] = [];
      const baseErrors: ValidationErrorItem[] = [];
      for (const item of normalized.errors) {
        const relativeLoc = normalizeServerErrorLocation(item.loc, {
          unionTag: protocol,
        });
        const isConfigError =
          relativeLoc.length === 0 ||
          relativeLoc[0] === "config" ||
          (!isCreate && item.loc[0] !== "body");
        (isConfigError ? configErrors : baseErrors).push(item);
      }

      if (configErrors.length > 0) {
        applyServerFieldErrors(
          configFormMethods,
          new GridoneError(422, configErrors),
          {
            ...sharedOptions,
            fieldNames: configFieldNames,
            prefixes: ["config"],
            unionTag: protocol,
          },
        );
      }
      if (baseErrors.length > 0) {
        applyServerFieldErrors(
          baseFormMethods,
          new GridoneError(422, baseErrors),
          {
            ...sharedOptions,
            fieldNames: ["name", "protocol"],
            unionTag: protocol,
          },
        );
      }
      return;
    }
    applyServerFieldErrors(configFormMethods, error, {
      ...sharedOptions,
      fieldNames: configFieldNames,
    });
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
