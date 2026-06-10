import { FC, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { Separator } from "@/components/ui/separator";
import { InputController } from "@/components/forms/controllers/InputController";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { IconPicker } from "@/components/forms/IconPicker";
import { toLabel } from "@/lib/textFormat";
import { useNavigate } from "react-router";

type SchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  anyOf?: { type?: string }[];
};

type BuildingProfileSchema = {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
};

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

/** A field's effective scalar type, unwrapping the `anyOf: [{...}, {null}]`
 *  shape Pydantic emits for optional fields. Numeric types map to a number
 *  input; everything else (incl. `icon`, for now) is a text input. */
function inputType(property: SchemaProperty): "number" | "text" {
  const type =
    property.type ??
    property.anyOf?.find((v) => v.type && v.type !== "null")?.type;
  return type === "number" || type === "integer" ? "number" : "text";
}

export const BuildingProfileForm: FC<{
  schema: Record<string, unknown>;
  defaultValues: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  isPending: boolean;
}> = ({ schema, defaultValues, onSubmit, isPending }) => {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();
  const typedSchema = schema as BuildingProfileSchema;

  const zodSchema = useMemo(
    () =>
      z.fromJSONSchema(
        schema as Parameters<typeof z.fromJSONSchema>[0],
      ) as z.ZodObject,
    [schema],
  );

  const { control, handleSubmit } = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: defaultValues as Record<string, string | number | null>,
  });

  const required = new Set(typedSchema.required ?? []);
  const buildingName = useWatch({ control, name: "name" }) as
    | string
    | null
    | undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(typedSchema.properties ?? {})
          .filter(([name]) => !HIDDEN_FIELDS.has(name))
          .map(([name, property]) => {
            const labelKey =
              FIELD_LABEL_KEYS[name as keyof typeof FIELD_LABEL_KEYS];
            const label = labelKey
              ? t(labelKey)
              : (property.title ?? toLabel(name));

            if (name === "icon") {
              return (
                <Controller
                  key={name}
                  name="icon"
                  control={control}
                  render={({ field }) => (
                    <FieldShell id="icon" label={label}>
                      <IconPicker
                        value={(field.value as string | null) ?? null}
                        onChange={field.onChange}
                        name={buildingName}
                      />
                    </FieldShell>
                  )}
                />
              );
            }

            return (
              <InputController
                key={name}
                name={name}
                control={control}
                label={label}
                type={inputType(property)}
                required={required.has(name)}
                description={property.description}
              />
            );
          })}
      </div>

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
