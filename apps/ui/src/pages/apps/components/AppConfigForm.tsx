import { FC, useEffect, useMemo, useState } from "react";
import { useForm, type FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isGridoneError } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import {
  defaultsFor,
  effectiveSchema,
  findDiscriminant,
  localizeSchema,
  pickSchemaKeys,
  toZodSchema,
  type AppSchemaNode,
} from "@/lib/appConfigSchema";
import {
  applyServerFieldErrors,
  normalizeSchema,
  SchemaFields,
  ServerErrorAlert,
  useClearServerErrorOnChange,
} from "@/components/forms/schema-form";
import { appConfigOverrides } from "./AppConfigField";
import { AppPushStatusBadge } from "./AppPushStatusBadge";
import type { PushStatus } from "@gridone/sdk";

interface AppConfigFormProps {
  appId: string;
  pushStatus?: PushStatus | null;
}

/** Status the API answers with when the app itself cannot serve its schema —
 *  a different failure from an app that simply declares no configuration. */
const APP_UNREACHABLE_STATUS = 503;
/** Configuration panel of an app: fetches the schema the app serves, renders
 *  the generated form, and reports how the last save was delivered. */
const AppConfigForm: FC<AppConfigFormProps> = ({ appId, pushStatus }) => {
  const { t } = useTranslation("apps");
  const client = useGridoneClient();

  const {
    data: schema,
    isLoading: schemaLoading,
    error: schemaError,
  } = useQuery({
    queryKey: ["apps", appId, "config-schema"],
    queryFn: async () =>
      (await client.apps.getConfigSchema(appId)) as AppSchemaNode,
    retry: false,
  });

  const {
    data: config,
    isLoading: configLoading,
    isError: configError,
  } = useQuery({
    queryKey: ["apps", appId, "config"],
    queryFn: () => client.apps.getConfig(appId),
    enabled: !!schema,
  });

  if (schemaLoading || configLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-4 h-32" />
        </CardContent>
      </Card>
    );
  }

  const unreachable =
    isGridoneError(schemaError) &&
    schemaError.status === APP_UNREACHABLE_STATUS;

  if (schemaError || configError || !schema?.properties) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted p-6">
        <h3 className="text-sm font-medium text-foreground">
          {t("configuration")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(unreachable ? "config.unreachable" : "noConfig")}
        </p>
      </div>
    );
  }

  return (
    <ConfigForm
      appId={appId}
      schema={schema}
      storedConfig={config ?? {}}
      pushStatus={pushStatus}
    />
  );
};

interface ConfigFormProps {
  appId: string;
  schema: AppSchemaNode;
  storedConfig: Record<string, unknown>;
  pushStatus?: PushStatus | null;
}

const ConfigForm: FC<ConfigFormProps> = ({
  appId,
  schema,
  storedConfig,
  pushStatus,
}) => {
  const { t, i18n } = useTranslation("apps");
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const locale = i18n.language;

  const discriminant = useMemo(() => findDiscriminant(schema), [schema]);
  const [branchValue, setBranchValue] = useState(() =>
    discriminant ? String(storedConfig[discriminant.name] ?? "") : undefined,
  );

  /** Root fields plus the selected branch's, as one flat object schema. */
  const activeSchema = useMemo(
    () => effectiveSchema(schema, branchValue),
    [schema, branchValue],
  );

  // Localized before normalization so the registry widgets and the
  // app-contract widgets both read resolved titles/descriptions.
  const { fields } = useMemo(
    () => normalizeSchema(localizeSchema(activeSchema, schema.i18n, locale)),
    [activeSchema, schema.i18n, locale],
  );

  const overrides = useMemo(() => appConfigOverrides(fields), [fields]);

  const resolver = useMemo(
    () => zodResolver(toZodSchema(activeSchema)),
    [activeSchema],
  );

  const form = useForm<FieldValues>({
    resolver,
    mode: "onChange",
    // Seeded once, from the branch the stored config already selects.
    defaultValues: { ...defaultsFor(activeSchema), ...storedConfig },
  });
  useClearServerErrorOnChange(form);
  const { control, handleSubmit, formState, watch } = form;

  // Selecting another branch swaps the rendered fields and the validator, but
  // must not rebuild the form — the root values already entered stay put.
  useEffect(() => {
    if (!discriminant) return;
    const subscription = watch((values, { name }) => {
      if (name === discriminant.name) {
        setBranchValue(String(values[discriminant.name] ?? ""));
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, discriminant]);

  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      client.apps.updateConfig(appId, values),
    onSuccess: () => {
      form.clearErrors("root.server");
      // Exact keys on purpose: a prefix invalidation would also re-fetch the
      // schema through the app, and an app that just went down would replace
      // the form with the unreachable panel right after a successful save.
      queryClient.invalidateQueries({ queryKey: ["apps"], exact: true });
      queryClient.invalidateQueries({ queryKey: ["apps", appId], exact: true });
      queryClient.invalidateQueries({ queryKey: ["apps", appId, "config"] });
      toast.success(t("configSaved"));
    },
    onError: (error: Error) => {
      applyServerFieldErrors(form, error, {
        fieldNames: fields.map((field) => field.name),
        fallbackMessage: t("configError"),
      });
    },
  });

  const onSubmit = (values: FieldValues) => {
    // Values of an abandoned `oneOf` branch stay in the form state; the config
    // is a flat object, so they would otherwise ship with the payload.
    mutation.mutate(pickSchemaKeys(values, activeSchema));
  };

  return (
    <Card>
      <CardContent className="py-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-sm font-medium text-foreground">
            {t("configuration")}
          </h3>
          <AppPushStatusBadge status={pushStatus} />
        </div>

        <ServerErrorAlert
          className="mb-4"
          title={t("config.rejected")}
          message={formState.errors.root?.server?.message}
        />

        <form
          id="app-config-form"
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-4 md:grid-cols-2"
        >
          <SchemaFields
            fields={fields}
            control={control}
            overrides={overrides}
          />
        </form>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          type="submit"
          form="app-config-form"
          disabled={!formState.isValid || mutation.isPending}
        >
          {mutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {t("configSave")}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AppConfigForm;
