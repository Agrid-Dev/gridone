import { FC, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { InputController } from "@/components/forms/controllers/InputController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import { toLabel } from "@/lib/textFormat";

interface AppConfigFormProps {
  appId: string;
}

/** UI view of the JSON schema an app declares for its config (the SDK types
 *  the payload loosely as an untyped JSON object). */
type JsonSchemaProperty = {
  type?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
};

type AppConfigSchema = {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

const AppConfigForm: FC<AppConfigFormProps> = ({ appId }) => {
  const { t } = useTranslation("apps");
  const client = useGridoneClient();

  const {
    data: schema,
    isLoading: schemaLoading,
    isError: schemaError,
  } = useQuery({
    queryKey: ["apps", appId, "config-schema"],
    queryFn: async () =>
      (await client.apps.getConfigSchema(appId)) as AppConfigSchema,
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

  if (schemaError || configError || !schema?.properties) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted p-6">
        <h3 className="text-sm font-medium text-foreground">
          {t("configuration")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("noConfig")}</p>
      </div>
    );
  }

  return <ConfigForm appId={appId} schema={schema} defaultValues={config!} />;
};

interface ConfigFormProps {
  appId: string;
  schema: AppConfigSchema;
  defaultValues: Record<string, unknown>;
}

const ConfigForm: FC<ConfigFormProps> = ({ appId, schema, defaultValues }) => {
  const { t } = useTranslation("apps");
  const queryClient = useQueryClient();
  const client = useGridoneClient();

  const zodSchema = useMemo(
    () =>
      z.fromJSONSchema(
        schema as Parameters<typeof z.fromJSONSchema>[0],
      ) as z.ZodObject,
    [schema],
  );

  const { control, handleSubmit, formState } = useForm({
    resolver: zodResolver(zodSchema),
    mode: "onChange",
    defaultValues: defaultValues as Record<string, string | number | boolean>,
  });

  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      client.apps.updateConfig(appId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps", appId, "config"] });
      toast.success(t("configSaved"));
    },
    onError: (err: Error) => toast.error(t("configError") + ": " + err.message),
  });

  const onSubmit = (values: Record<string, unknown>) => {
    mutation.mutate(values);
  };

  const requiredSet = new Set(schema.required ?? []);
  const isBusy = mutation.isPending;

  return (
    <Card>
      <CardContent className="py-6">
        <h3 className="mb-4 text-sm font-medium text-foreground">
          {t("configuration")}
        </h3>
        <form
          id="app-config-form"
          onSubmit={handleSubmit(onSubmit)}
          className="grid gap-4 md:grid-cols-2"
        >
          {Object.entries(schema.properties ?? {}).map(
            ([propertyName, property]) => {
              if (property.type === "boolean") {
                return (
                  <SwitchController
                    key={propertyName}
                    name={propertyName}
                    control={control}
                    label={toLabel(propertyName)}
                    required={requiredSet.has(propertyName)}
                    description={property.description}
                  />
                );
              }

              return (
                <InputController
                  key={propertyName}
                  name={propertyName}
                  control={control}
                  label={toLabel(propertyName)}
                  type={property.type}
                  required={requiredSet.has(propertyName)}
                  description={property.description}
                />
              );
            },
          )}
        </form>
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          type="submit"
          form="app-config-form"
          disabled={!formState.isValid || isBusy}
        >
          {isBusy ? (
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
