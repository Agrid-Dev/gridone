import { useEffect, useMemo } from "react";
import {
  useForm,
  useWatch,
  type Control,
  type FieldValues,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { InputController } from "@/components/forms/controllers/InputController";
import { SchemaField, type JsonSchema } from "@/components/forms/SchemaField";

export interface WidgetFormValues {
  title: string;
  /** The full widget config, including its `type` discriminator. */
  config: Record<string, unknown>;
}

/** What the form currently describes, for the page around it: the values as
 *  they would be submitted (`null` while they don't satisfy the type's schema),
 *  plus the flags its page-level controls need. */
export interface WidgetFormState {
  draft: WidgetFormValues | null;
  /** Whether the user changed anything — drives the discard-changes guard. */
  dirty: boolean;
  submitting: boolean;
}

interface WidgetFormProps {
  /** The type being authored. Owned by the page: it decides both the fields
   *  below and what the preview renders, so it is not a field of this form. */
  type: string;
  /** JSON Schema of that type's config (from GET widget-schemas). */
  configSchema: Record<string, unknown>;
  defaultTitle?: string;
  defaultConfig?: Record<string, unknown>;
  /** Lets the page's submit button drive this form (`<button form={id}>`). */
  formId: string;
  onSubmit: (values: WidgetFormValues) => Promise<void>;
  /** Called on every value change so the page can render a live preview and
   *  enable its controls. Must be referentially stable (e.g. a `useState`
   *  setter). */
  onStateChange?: (state: WidgetFormState) => void;
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

/** Normalize raw form values into what gets submitted (and previewed): the
 *  immutable `type` discriminator is stamped on the config regardless of field
 *  registration, and the title is trimmed. */
function toSubmitValues(
  values: WidgetFormValues,
  type: string,
): WidgetFormValues {
  return {
    title: values.title.trim(),
    config: { ...values.config, type },
  };
}

/** Config form for one widget type: title + fields rendered from the type's
 *  JSON Schema. Holds no actions — the page owns them, next to the type
 *  selector, since both apply to the editor as a whole. Remount it (keyed by
 *  type) when the type changes. */
export function WidgetForm({
  type,
  configSchema,
  defaultTitle,
  defaultConfig,
  formId,
  onSubmit,
  onStateChange,
}: WidgetFormProps) {
  const { t } = useTranslation("dashboards");
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

  const submit = form.handleSubmit(async (values) =>
    onSubmit(toSubmitValues(values, type)),
  );

  const values = useWatch({
    control: form.control,
  }) as Partial<WidgetFormValues>;
  const { isValid, isDirty, isSubmitting } = form.formState;
  // `useWatch` hands back a fresh object on every render, so the effect is keyed
  // on a serialized snapshot instead — otherwise reporting up would re-render
  // the caller, which re-renders this form, which reports again, forever.
  const snapshot = JSON.stringify(values);

  useEffect(() => {
    if (!onStateChange) return;
    const current = JSON.parse(snapshot) as Partial<WidgetFormValues>;
    onStateChange({
      draft: isValid
        ? toSubmitValues(
            {
              title: current.title ?? "",
              config: current.config ?? {},
            },
            type,
          )
        : null,
      dirty: isDirty,
      submitting: isSubmitting,
    });
  }, [onStateChange, snapshot, isValid, isDirty, isSubmitting, type]);

  const required = new Set(schema.required ?? []);
  const configProps = Object.entries(schema.properties ?? {}).filter(
    ([name]) => name !== "type",
  );

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
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
    </form>
  );
}
