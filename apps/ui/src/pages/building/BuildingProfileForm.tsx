import { FC } from "react";
import { useController, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui";
import { Separator } from "@/components/ui/separator";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { IconPicker } from "@/components/forms/IconPicker";
import {
  applyServerFieldErrors,
  SchemaFields,
  ServerErrorAlert,
  useSchemaForm,
  type SchemaFormValues,
  type SchemaWidgetProps,
} from "@/components/forms/schema-form";

/** Schema field name → its localized label key in the `profile` namespace.
 *  Unknown fields fall back to the schema `title` / a humanized name. */
const FIELD_LABEL_KEYS = {
  name: "fields.name",
  address: "fields.address",
  surface: "fields.surface",
  floors: "fields.floors",
  year_built: "fields.year_built",
  operator: "fields.operator",
  icon: "fields.icon",
} as const;

/** Schema fields not surfaced in the form (kept on save, just not edited). */
const HIDDEN_FIELDS = new Set(["latitude", "longitude", "cover_url"]);

/** `icon` widget override: the schema types it as free text, the form offers
 *  the supported set through the picker (suggestions keyed off the name). */
const IconWidget: FC<SchemaWidgetProps> = ({ descriptor, name, control }) => {
  const { field } = useController({ name, control });
  const buildingName = useWatch({ control, name: "name" }) as
    | string
    | null
    | undefined;
  return (
    <FieldShell id={name} label={descriptor.label}>
      <IconPicker
        value={(field.value as string | null) ?? null}
        onChange={field.onChange}
        name={buildingName}
      />
    </FieldShell>
  );
};

export const BuildingProfileForm: FC<{
  schema: Record<string, unknown>;
  defaultValues: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>;
  isPending: boolean;
}> = ({ schema, defaultValues, onSubmit, isPending }) => {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();

  const { form, fields } = useSchemaForm({
    schema,
    values: defaultValues as SchemaFormValues,
  });

  // Hidden fields stay in the form state and the submitted payload — they are
  // only excluded from rendering.
  const visibleFields = fields
    .filter((field) => !HIDDEN_FIELDS.has(field.name))
    .map((field) => {
      const labelKey =
        FIELD_LABEL_KEYS[field.name as keyof typeof FIELD_LABEL_KEYS];
      return labelKey ? { ...field, label: t(labelKey) } : field;
    });

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      await onSubmit(values);
    } catch (error) {
      applyServerFieldErrors(form, error, {
        fieldNames: visibleFields.map((field) => field.name),
        fallbackMessage: t("saveError"),
      });
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <SchemaFields
          fields={visibleFields}
          control={form.control}
          overrides={{ icon: IconWidget }}
        />
      </div>

      <ServerErrorAlert message={form.formState.errors.root?.server?.message} />

      <Separator />

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          onClick={() => navigate("..")}
          variant="secondary"
        >
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
};
