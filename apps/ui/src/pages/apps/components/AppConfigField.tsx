import { FC, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  get,
  useController,
  type Control,
  type FieldError,
  type FieldValues,
} from "react-hook-form";
import { ImageUp, Trash2 } from "lucide-react";
import { MultiSelectController } from "@/components/forms/controllers/MultiSelectController";
import { SchemaField } from "@/components/forms/SchemaField";
import { AssetPicker } from "@/components/forms/resourcePickers/AssetPicker";
import { DevicePicker } from "@/components/forms/resourcePickers/DevicePicker";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { DevicePickerTable } from "@/components/forms/targetPicker/DevicePickerTable";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDevicesList } from "@/hooks/useDevicesList";
import { sortedByName } from "@/lib/sortByName";
import { toLabel } from "@/lib/textFormat";
import type {
  FieldDescriptor,
  SchemaFieldOverrides,
  SchemaWidgetProps,
} from "@/components/forms/schema-form";
import {
  ASSET_ID_FORMAT,
  DEVICE_ID_FORMAT,
  isImageField,
  maxImageBytes,
  type AppSchemaNode,
} from "@/lib/appConfigSchema";
import { ZoneOverridesField } from "./ZoneOverridesField";
import { WeeklyScheduleField } from "./WeeklyScheduleField";

/** Field name the zone-overrides table widget is keyed on. */
const ZONE_OVERRIDES_FIELD = "zone_overrides";
/** Field name the weekly-schedule table widget is keyed on. */
const WEEKLY_SCHEDULE_FIELD = "weekly_schedule";

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
 * asset and device references, image uploads and scalar list values, plus
 * fields keyed by name rather than shape (`zone_overrides`,
 * `weekly_schedule`). The config form renders through `SchemaFields`, and
 * this component is mounted through its per-consumer `overrides` seam
 * (`appConfigOverrides` below) only for the shapes/fields above; primitives —
 * including `format: password`, masked by the registry's shared secret
 * widget — go straight to the widget registry. (The `SchemaField` delegation
 * at the bottom keeps this component usable standalone.) `asset-id` is why
 * the seam exists rather than a registry entry — it pulls `useAssetTree`, and
 * the shared builder must stay domain-agnostic. Flat-object arrays live in
 * the registry; scalar arrays deliberately keep the app-contract
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

  if (name === WEEKLY_SCHEDULE_FIELD && isArray) {
    return (
      <WeeklyScheduleField
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

  // `device-id` takes two widgets, unlike `asset-id`: `DevicePicker` has no
  // multi-select variant, so an array of device ids gets a checkbox table
  // instead, whose header box selects every listed device.
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

  if (isArray && itemSchema.format === DEVICE_ID_FORMAT) {
    return (
      <DeviceListField
        name={name}
        schema={schema}
        control={control}
        required={required}
      />
    );
  }

  if (isImageField(schema)) {
    return (
      <ImageField
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
  if (
    field.name === ZONE_OVERRIDES_FIELD ||
    field.name === WEEKLY_SCHEDULE_FIELD
  ) {
    return true;
  }
  if (schema.format === ASSET_ID_FORMAT || schema.format === DEVICE_ID_FORMAT) {
    return true;
  }
  // The registry would render the base64 as a text input.
  if (isImageField(schema)) return true;
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

/** The ids an array of `device-id` holds; none for any other value. */
const idsOf = (value: unknown): string[] =>
  Array.isArray(value) ? (value as string[]) : [];

/** The single device type a `device-id` node restricts its candidates to, if
 *  the app declares one. */
const deviceTypeOf = (node: AppSchemaNode | undefined): string | undefined =>
  typeof node?.device_type === "string" ? node.device_type : undefined;

/** `format: device-id` — single select over devices, restricted to
 *  `device_type` when the app declares one. */
const DeviceField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { field, fieldState } = useController({ name, control });
  const deviceType = deviceTypeOf(schema);

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

/**
 * Array of `format: device-id` — a checkbox table over the devices,
 * restricted to `items.device_type` when the app declares one. The header box
 * selects every row listed at that moment; the form holds their ids.
 *
 * A stored or chosen id that no listed device has — the device was deleted, or
 * is no longer of that type — gets a row of its own, so it is neither shipped
 * nor dropped unseen: the user sees it ticked and can untick it. The stored ids
 * keep their row once unticked, for the user to change their mind.
 */
const DeviceListField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { t } = useTranslation("common");
  const { field, fieldState, formState } = useController({ name, control });
  const deviceType = deviceTypeOf(schema.items);
  const { devices, loading, error } = useDevicesList(
    deviceType ? { types: [deviceType] } : undefined,
  );
  const sortedDevices = useMemo(() => sortedByName(devices), [devices]);
  const selectedIds = idsOf(field.value);
  const storedIds = idsOf(get(formState.defaultValues, name));
  // `DevicePickerTable` drops the ids a listed device has.
  const missingIds = [...new Set([...storedIds, ...selectedIds])];

  return (
    // A table needs the width of the form, not half of its grid.
    <div className="min-w-0 md:col-span-2">
      <FieldShell
        id={name}
        invalid={fieldState.invalid}
        label={schema.title}
        description={schema.description}
        error={fieldState.error}
        required={required}
      >
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">
            {t("errors.loadError")}
          </p>
        ) : (
          <div role="group" aria-label={schema.title}>
            <DevicePickerTable
              devices={sortedDevices}
              selectedIds={selectedIds}
              onChange={field.onChange}
              missingIds={missingIds}
              missingLabel={(id) => t("pickers.device.missing", { id })}
              emptyMessage={t("pickers.device.noDevices")}
            />
          </div>
        )}
      </FieldShell>
    </div>
  );
};

/**
 * Image upload (`contentMediaType: image/*` + `contentEncoding: base64`):
 * choose a file, preview it, replace it — or remove it, unless the field is
 * required. The form holds the raw base64 of the file, without any `data:`
 * prefix. A file over the `maxLength` cap, of another media type than the
 * declared one, or that the browser cannot decode as an image, is refused
 * (`readImageFile`), and the value stays as it was.
 *
 * Only the latest choice lands: a file still being read when another is
 * chosen, or when the image is removed, is dropped once read.
 *
 * A removed image is held as `""`, not `undefined`: a controller reads
 * `undefined` as "fall back to the default value", which would bring the
 * stored image back. `pickSchemaKeys` leaves that `""` out of the payload —
 * hence no Remove on a required image, whose key the payload must carry.
 */
const ImageField: FC<AppConfigFieldProps> = ({
  name,
  schema,
  control,
  required,
}) => {
  const { t, i18n } = useTranslation("apps");
  const { field, fieldState } = useController({ name, control });
  const inputRef = useRef<HTMLInputElement>(null);
  // Moved on by every choice and removal: a read finding it moved is stale.
  const latestChoice = useRef(0);
  const [refusal, setRefusal] = useState<string | null>(null);
  // `isImageField` routed us here, so the media type is an `image/*` string.
  const mediaType = String(schema.contentMediaType);
  const maxBytes = maxImageBytes(schema);
  const value =
    typeof field.value === "string" && field.value !== ""
      ? field.value
      : undefined;
  // A refused file leaves the value as it was, so its reason shows in the
  // field's own error slot rather than through react-hook-form.
  const error: FieldError | undefined = refusal
    ? { type: "validate", message: refusal }
    : fieldState.error;

  const refusalMessage = (reason: ImageRefusal): string => {
    switch (reason) {
      case "tooLarge":
        return t("config.image.tooLarge", {
          size: formatKilobytes(maxBytes ?? 0, i18n.language),
        });
      case "wrongType":
        return t("config.image.wrongType", {
          format: mediaTypeName(mediaType),
        });
      case "unreadable":
        return t("config.image.unreadable");
    }
  };

  const takeFile = async (file: File) => {
    const choice = ++latestChoice.current;
    setRefusal(null);
    const read = await readImageFile(file, mediaType, maxBytes);
    if (choice !== latestChoice.current) return;
    if ("refusal" in read) {
      setRefusal(refusalMessage(read.refusal));
      return;
    }
    field.onChange(read.base64);
  };

  const removeImage = () => {
    latestChoice.current += 1;
    setRefusal(null);
    field.onChange("");
  };

  return (
    <FieldShell
      id={name}
      invalid={error !== undefined}
      label={schema.title}
      description={schema.description}
      error={error}
      required={required}
    >
      <input
        ref={inputRef}
        id={name}
        type="file"
        accept={mediaType}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared so that choosing the same file again still fires.
          event.currentTarget.value = "";
          if (file) void takeFile(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {value && (
          // On mid-grey: a light image with transparency (a logo for a dark
          // screen) shows as well as a dark one.
          <img
            src={`data:${mediaType};base64,${value}`}
            alt={t("config.image.preview")}
            className="h-20 max-w-48 rounded-md border bg-muted-foreground object-contain"
          />
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          onBlur={field.onBlur}
        >
          <ImageUp />
          {t(value ? "config.image.replace" : "config.image.choose")}
        </Button>
        {value && !required && (
          <Button type="button" variant="ghost" onClick={removeImage}>
            <Trash2 />
            {t("config.image.remove")}
          </Button>
        )}
      </div>
    </FieldShell>
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

/** Why an image field refuses a chosen file. */
type ImageRefusal = "tooLarge" | "wrongType" | "unreadable";

/** Leading bytes every file of a media type starts with, where they are cheap
 *  to check and decisive: a JPEG renamed `logo.png` still starts `FF D8 FF`. */
const FILE_SIGNATURES: Record<string, readonly number[]> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
};

const SVG_MEDIA_TYPE = "image/svg+xml";

/**
 * Reads a file chosen for an image field declaring `mediaType`: its raw
 * base64, or why it is refused. In order: over `maxBytes`, checked before
 * anything is read; of another media type (`hasMediaType`); or not decodable
 * as an image — truncated, not an image at all, or gone from the disk since
 * it was chosen. An SVG is decoded by an `<img>` element, since
 * `createImageBitmap` rejects every SVG.
 */
async function readImageFile(
  file: File,
  mediaType: string,
  maxBytes: number | undefined,
): Promise<{ base64: string } | { refusal: ImageRefusal }> {
  if (maxBytes !== undefined && file.size > maxBytes) {
    return { refusal: "tooLarge" };
  }
  const type = mediaType.toLowerCase();
  try {
    if (!(await hasMediaType(file, type))) return { refusal: "wrongType" };
    if (type === SVG_MEDIA_TYPE) {
      const base64 = await readBase64(file);
      const image = new Image();
      image.src = `data:${type};base64,${base64}`;
      await image.decode();
      return { base64 };
    }
    (await createImageBitmap(file)).close();
    return { base64: await readBase64(file) };
  } catch {
    return { refusal: "unreadable" };
  }
}

/** Whether `file` is of the (lower-case) `mediaType`: by the type the browser
 *  gives it — which comes from its extension, so a hint only — and, where a
 *  signature is known (`FILE_SIGNATURES`), by its leading bytes. */
async function hasMediaType(file: File, mediaType: string): Promise<boolean> {
  if (file.type !== mediaType) return false;
  const signature = FILE_SIGNATURES[mediaType];
  if (signature === undefined) return true;
  const head = new Uint8Array(
    await file.slice(0, signature.length).arrayBuffer(),
  );
  return signature.every((byte, index) => head[index] === byte);
}

/** A media type as users name the format: `image/png` -> `PNG`,
 *  `image/svg+xml` -> `SVG`. */
function mediaTypeName(mediaType: string): string {
  const subtype = mediaType.slice(mediaType.indexOf("/") + 1);
  return subtype.split("+")[0].toUpperCase();
}

/** The file's bytes in base64: `readAsDataURL` yields
 *  `data:image/png;base64,iVBORw0…`, and everything up to the first comma is
 *  dropped. Rejects when the file cannot be read. */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** A byte count in kilobytes (1 KB = 1024 bytes), to state an upload cap. */
function formatKilobytes(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    bytes / 1024,
  );
}

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
