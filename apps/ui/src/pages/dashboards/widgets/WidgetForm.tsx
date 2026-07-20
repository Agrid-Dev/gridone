import { useMemo, useState } from "react";
import {
  useForm,
  type Control,
  type FieldValues,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { InputController } from "@/components/forms/controllers/InputController";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toLabel } from "@/lib/textFormat";
import { SchemaField, type JsonSchema } from "./SchemaField";

export interface WidgetFormValues {
  title: string;
  /** The full widget config, including its `type` discriminator. */
  config: Record<string, unknown>;
}

interface WidgetFormProps {
  /** type → JSON Schema of that type's config (from GET widget-schemas). */
  schemas: Record<string, Record<string, unknown>>;
  defaultType?: string;
  defaultTitle?: string;
  defaultConfig?: Record<string, unknown>;
  /** Lock the type (edit): a widget's type is immutable after creation. */
  typeLocked?: boolean;
  submitLabel: string;
  onSubmit: (values: WidgetFormValues) => Promise<void>;
  onCancel: () => void;
}

/** Build a valid-shaped empty config for a type from its schema. */
function emptyConfig(
  schema: JsonSchema,
  type: string,
): Record<string, unknown> {
  const config: Record<string, unknown> = { type };
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (name === "type") continue;
    if (prop.default !== undefined) config[name] = prop.default;
    else if (prop.type === "boolean") config[name] = false;
    else if (prop.type === "number" || prop.type === "integer")
      config[name] = undefined;
    else config[name] = "";
  }
  return config;
}

/** Config form for one widget type: title + fields rendered from the type's
 *  JSON Schema. Remounted (keyed by type) when the type changes. */
function WidgetTypeForm({
  type,
  configSchema,
  defaultTitle,
  defaultConfig,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  type: string;
  configSchema: Record<string, unknown>;
  defaultTitle?: string;
  defaultConfig?: Record<string, unknown>;
  submitLabel: string;
  onSubmit: (values: WidgetFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation(["dashboards", "common"]);
  const schema = configSchema as unknown as JsonSchema;

  const formSchema = useMemo(
    () =>
      z.object({ title: z.string(), config: z.fromJSONSchema(configSchema) }),
    [configSchema],
  );
  const resolver = zodResolver(
    formSchema as unknown as z.ZodType<WidgetFormValues, WidgetFormValues>,
  ) as Resolver<WidgetFormValues>;

  const form = useForm<WidgetFormValues>({
    resolver,
    mode: "onChange",
    defaultValues: {
      title: defaultTitle ?? "",
      config: defaultConfig ?? emptyConfig(schema, type),
    },
  });

  const submit = form.handleSubmit(async (values) => {
    // Guarantee the immutable discriminator regardless of field registration.
    await onSubmit({
      title: values.title.trim(),
      config: { ...values.config, type },
    });
  });

  const required = new Set(schema.required ?? []);
  const configProps = Object.entries(schema.properties ?? {}).filter(
    ([name]) => name !== "type",
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <InputController
        name="title"
        control={form.control as unknown as Control<FieldValues>}
        label={t("widgets.fields.title")}
      />
      {configProps.map(([name, prop]) => (
        <SchemaField
          key={name}
          name={`config.${name}`}
          propName={name}
          schema={prop}
          control={form.control as unknown as Control<FieldValues>}
          required={required.has(name)}
        />
      ))}
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onCancel}>
          {t("common:common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!form.formState.isValid || form.formState.isSubmitting}
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Add/edit a widget: pick the type (locked on edit), then a config form
 *  rendered from that type's JSON Schema. */
export function WidgetForm({
  schemas,
  defaultType,
  defaultTitle,
  defaultConfig,
  typeLocked,
  submitLabel,
  onSubmit,
  onCancel,
}: WidgetFormProps) {
  const { t } = useTranslation("dashboards");
  const types = Object.keys(schemas);
  const [type, setType] = useState(defaultType ?? types[0]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="widget-type" className="text-sm font-medium">
          {t("widgets.fields.type")}
        </label>
        <Select value={type} onValueChange={setType} disabled={typeLocked}>
          <SelectTrigger id="widget-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((widgetType) => (
              <SelectItem key={widgetType} value={widgetType}>
                {toLabel(widgetType)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <WidgetTypeForm
        key={type}
        type={type}
        configSchema={schemas[type]}
        defaultTitle={defaultTitle}
        defaultConfig={type === defaultType ? defaultConfig : undefined}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </div>
  );
}
