import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { InputController } from "@/components/forms/controllers/InputController";
import { MultiSelectController } from "@/components/forms/controllers/MultiSelectController";
import { SchemaField } from "@/components/forms/SchemaField";
import { AssetPicker } from "@/components/forms/resourcePickers/AssetPicker";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { Textarea } from "@/components/ui/textarea";
import { toLabel } from "@/lib/textFormat";
import {
  ASSET_ID_FORMAT,
  PASSWORD_FORMAT,
  type AppSchemaNode,
} from "@/lib/appConfigSchema";

interface AppConfigFieldProps {
  name: string;
  /** Localized schema node: `title`/`description` are already resolved. */
  schema: AppSchemaNode;
  control: Control<FieldValues>;
  required: boolean;
}

/**
 * Renders one property of an app config schema.
 *
 * Handles the widgets the app contract adds on top of plain JSON Schema —
 * asset references, masked secrets, list values — and delegates every
 * primitive (`enum`, boolean, number, string) to the shared ``SchemaField``.
 *
 * **Do not copy this mapping into another feature.** These are repo-wide
 * JSON Schema conventions living here only until the schema-driven forms
 * project gives them a home: the `schema-form` widget registry now exists
 * (AGR-919), AGR-920 migrates app config onto it, AGR-922 adds array
 * support. `asset-id` is the one that needs the registry's per-consumer
 * `overrides` seam rather than a plain move — it pulls `useAssetTree`, and
 * the shared builder must stay domain-agnostic.
 */
export const AppConfigField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const isArray = schema.type === "array";
  const itemSchema = schema.items ?? {};

  if (
    schema.format === ASSET_ID_FORMAT ||
    itemSchema.format === ASSET_ID_FORMAT
  ) {
    return (
      <AssetField
        name={name}
        schema={schema}
        control={control}
        required={required}
        multiple={isArray}
      />
    );
  }

  if (schema.format === PASSWORD_FORMAT) {
    return (
      <InputController
        name={name}
        control={control}
        label={schema.title}
        description={schema.description}
        required={required}
        type="password"
      />
    );
  }

  if (isArray && Array.isArray(itemSchema.enum)) {
    return (
      <EnumListField
        name={name}
        schema={schema}
        control={control}
        required={required}
      />
    );
  }

  if (isArray) {
    return (
      <ListField
        name={name}
        schema={schema}
        control={control}
        required={required}
      />
    );
  }

  return (
    <SchemaField
      name={name}
      propName={name}
      schema={schema}
      control={control}
      required={required}
    />
  );
};

/** `format: asset-id` — multi-select over the asset tree for an array, single
 *  select for a string, per the app config contract. */
const AssetField: FC<AppConfigFieldProps & { multiple: boolean }> = ({
  name,
  schema,
  control,
  required,
  multiple,
}) => {
  const { field, fieldState } = useController({ name, control });
  const shared = {
    id: name,
    label: schema.title,
    description: schema.description,
    required,
    invalid: fieldState.invalid,
    error: fieldState.error,
  };

  if (multiple) {
    return (
      <AssetPicker
        multiple
        value={Array.isArray(field.value) ? (field.value as string[]) : []}
        onChange={field.onChange}
        {...shared}
      />
    );
  }

  return (
    <AssetPicker
      value={typeof field.value === "string" ? field.value : undefined}
      onChange={field.onChange}
      {...shared}
    />
  );
};

/** `items.enum` — multi-select over the values the app enumerates. */
const EnumListField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { t } = useTranslation("common");

  return (
    <MultiSelectController
      name={name}
      control={control}
      label={schema.title}
      description={schema.description}
      required={required}
      options={(schema.items?.enum ?? []).map((value) => ({
        value: String(value),
        label: toLabel(String(value)),
      }))}
      placeholder={t("pickers.multiSelect.placeholder")}
      searchPlaceholder={t("pickers.multiSelect.search")}
      emptyMessage={t("pickers.multiSelect.noOptions")}
    />
  );
};

/**
 * Fallback for an array with no enumerable domain: one value per line.
 *
 * A multi-select needs a set to pick from — `items.format: asset-id` or an
 * `items.enum`. Absent both, the app declares a free-form list, and a textarea
 * is the honest control for it.
 */
const ListField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { field, fieldState } = useController({ name, control });
  const values = Array.isArray(field.value) ? (field.value as unknown[]) : [];
  const isNumeric =
    schema.items?.type === "number" || schema.items?.type === "integer";

  return (
    <FieldShell
      id={name}
      invalid={fieldState.invalid}
      label={schema.title}
      description={schema.description}
      error={fieldState.error}
      required={required}
    >
      <Textarea
        id={name}
        aria-invalid={fieldState.invalid}
        aria-required={required}
        rows={3}
        value={values.join("\n")}
        onBlur={field.onBlur}
        onChange={(event) =>
          field.onChange(parseLines(event.currentTarget.value, isNumeric))
        }
      />
    </FieldShell>
  );
};

/** Splits textarea content into list values, dropping blank lines. Numeric
 *  items keep unparseable text as-is so the validator, not the input, reports
 *  it. */
function parseLines(raw: string, isNumeric: boolean): unknown[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      if (!isNumeric) return line;
      const parsed = Number(line);
      return Number.isNaN(parsed) ? line : parsed;
    });
}
