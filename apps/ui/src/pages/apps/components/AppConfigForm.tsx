import { FC, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getAppConfigSchema,
  getAppConfig,
  updateAppConfig,
  type AppConfigSchema,
} from "@/api/apps";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { InputController } from "@/components/forms/controllers/InputController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import { toLabel } from "@/lib/textFormat";

interface AppConfigFormProps {
  appId: string;
}

const AppConfigForm: FC<AppConfigFormProps> = ({ appId }) => {
  const { t } = useTranslation();

  const {
    data: schema,
    isLoading: schemaLoading,
    isError: schemaError,
  } = useQuery({
    queryKey: ["apps", appId, "config-schema"],
    queryFn: () => getAppConfigSchema(appId),
  });

  const {
    data: config,
    isLoading: configLoading,
    isError: configError,
  } = useQuery({
    queryKey: ["apps", appId, "config"],
    queryFn: () => getAppConfig(appId),
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
          {t("apps.configuration")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("apps.noConfig")}
        </p>
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const zodSchema = useMemo(
    () => z.fromJSONSchema(schema) as z.ZodObject,
    [schema],
  );

  const { control, handleSubmit, formState } = useForm({
    resolver: zodResolver(zodSchema),
    mode: "onChange",
    defaultValues: defaultValues as Record<string, string | number | boolean>,
  });

  const mutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      updateAppConfig(appId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apps", appId, "config"] });
      toast.success(t("apps.configSaved"));
    },
    onError: (err: Error) =>
      toast.error(t("apps.configError") + ": " + err.message),
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
          {t("apps.configuration")}
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
          {t("apps.configSave")}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AppConfigForm;
