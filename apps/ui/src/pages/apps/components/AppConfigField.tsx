import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useController, type Control, type FieldValues } from "react-hook-form";
import { MultiSelectController } from "@/components/forms/controllers/MultiSelectController";
import { SchemaField } from "@/components/forms/SchemaField";
import { AssetPicker } from "@/components/forms/resourcePickers/AssetPicker";
import { DevicePicker } from "@/components/forms/resourcePickers/DevicePicker";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { Textarea } from "@/components/ui/textarea";
import { toLabel } from "@/lib/textFormat";
import type {
  FieldDescriptor,
  SchemaFieldOverrides,
  SchemaWidgetProps,
} from "@/components/forms/schema-form";
import {
  ASSET_ID_FORMAT,
  DEVICE_ID_FORMAT,
  type AppSchemaNode,
} from "@/lib/appConfigSchema";
import { ZoneOverridesField } from "./ZoneOverridesField";

/** Field name the zone-overrides table widget is keyed on (AGR-1067). */
const ZONE_OVERRIDES_FIELD = "zone_overrides";

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
 * asset references and scalar list values, plus one field keyed by name
 * rather than shape (`zone_overrides`, AGR-1067/1068). Since AGR-920 the
 * config form renders through `SchemaFields`, and this component is mounted
 * through its per-consumer `overrides` seam (`appConfigOverrides` below)
 * only for the shapes/fields above; primitives — including `format:
 * password`, masked by the registry's shared secret widget — go straight to
 * the widget registry. (The `SchemaField` delegation at the bottom keeps
 * this component usable standalone.) `asset-id` is why the seam exists
 * rather than a registry entry — it pulls `useAssetTree`, and the shared
 * builder must stay domain-agnostic. Flat-object arrays live in the
 * registry (AGR-922); scalar arrays deliberately keep the app-contract
 * pickers/textarea here.
 */
export const AppConfigField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const isArray = schema.type === "array";
  const itemSchema = schema.items ?? {};

  if (name === ZONE_OVERRIDES_FIELD && isArray) {
    return (
      <ZoneOverridesField
        name={name}
        schema={schema}
        control={control}
        required={required}
      />
    );
  }

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

  // Single-value only, unlike `asset-id`: `DevicePicker` has no multi-select
  // variant, so `itemSchema.format === DEVICE_ID_FORMAT` is deliberately not
  // checked here — an array of device ids falls through to `ListField` below,
  // same as any other scalar array with no dedicated widget.
  if (schema.format === DEVICE_ID_FORMAT) {
    return (
      <DeviceField
        name={name}
        schema={schema}
        control={control}
        required={required}
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

/** The shapes the app contract renders itself instead of the registry.
 *  `format: password` is NOT one of them anymore: the registry's shared
 *  secret widget masks it (same path as the first-party `secret` marker). */
const needsAppWidget = (field: FieldDescriptor): boolean => {
  const schema = field.schema as AppSchemaNode;
  if (field.name === ZONE_OVERRIDES_FIELD) {
    return true;
  }
  if (schema.format === ASSET_ID_FORMAT || schema.format === DEVICE_ID_FORMAT) {
    return true;
  }
  // Keep the app contract's scalar-array pickers/text area, but let the shared
  // registry own row-based flat-object arrays. Unsupported deeper arrays must
  // reach its explicit placeholder instead of degrading to "[object Object]".
  return schema.type === "array" && field.arrayItem?.kind === "scalar";
};

/** `AppConfigField` mounted as a schema-form widget (override seam). The
 *  descriptor's label wins so untitled properties keep a humanized label. */
const AppConfigWidget: FC<SchemaWidgetProps> = ({
  descriptor,
  name,
  control,
}) => (
  <AppConfigField
    name={name}
    schema={{
      ...(descriptor.schema as AppSchemaNode),
      title: descriptor.label,
    }}
    control={control}
    required={descriptor.required}
  />
);

/** Per-field `SchemaFields` overrides for the app-contract shapes. */
export const appConfigOverrides = (
  fields: FieldDescriptor[],
): SchemaFieldOverrides =>
  Object.fromEntries(
    fields.filter(needsAppWidget).map((field) => [field.name, AppConfigWidget]),
  );

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

/** `format: device-id` — single select over devices, restricted to
 *  `device_type` when the app declares one. */
const DeviceField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { field, fieldState } = useController({ name, control });
  const deviceType =
    typeof schema.device_type === "string" ? schema.device_type : undefined;

  return (
    <DevicePicker
      id={name}
      value={typeof field.value === "string" ? field.value : undefined}
      onSelect={(device) => field.onChange(device?.id)}
      filter={deviceType ? { types: [deviceType] } : undefined}
      label={schema.title}
      description={schema.description}
      required={required}
      invalid={fieldState.invalid}
      error={fieldState.error}
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
