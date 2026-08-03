import { useEffect, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import {
  useController,
  useFieldArray,
  useFormState,
  type Control,
  type FieldArrayPath,
  type FieldValues,
} from "react-hook-form";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui";
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { toLabel } from "@/lib/textFormat";
import type { ArrayItemDescriptor, FieldDescriptor, FieldKind } from "./types";

export interface SchemaWidgetProps {
  descriptor: FieldDescriptor;
  /** Full RHF field path (prefix included), e.g. `config.host` or `host`. */
  name: string;
  control: Control<FieldValues>;
}

/** Per-consumer widget overrides, keyed by property name. The seam for
 *  domain-specific widgets (e.g. app config's `format: asset-id` picker) that
 *  must not enter this domain-agnostic registry. */
export type SchemaFieldOverrides = Record<
  string,
  ComponentType<SchemaWidgetProps>
>;

/** Enumerates the concrete RHF paths currently rendered for server-error
 * mapping, including indexed array rows and flat object item properties.
 * `unsupported` descriptors are excluded: their placeholder renders no
 * `FieldError`, so an error mapped onto them would disappear entirely —
 * omitting the path routes it to the root banner instead. */
export const schemaFieldPaths = (
  fields: FieldDescriptor[],
  values: FieldValues,
  namePrefix = "",
): string[] => {
  const paths: string[] = [];
  for (const descriptor of fields) {
    if (descriptor.kind === "unsupported") continue;
    const name = `${namePrefix}${descriptor.name}`;
    paths.push(name);
    if (descriptor.kind !== "array" || !descriptor.arrayItem) continue;
    const value = name.split(".").reduce<unknown>((current, segment) => {
      if (typeof current !== "object" || current === null) return undefined;
      return (current as Record<string, unknown>)[segment];
    }, values);
    if (!Array.isArray(value)) continue;

    value.forEach((_item, index) => {
      const rowName = `${name}.${index}`;
      paths.push(rowName);
      if (descriptor.arrayItem?.kind === "object") {
        paths.push(
          ...descriptor.arrayItem.fields.map(
            (field) => `${rowName}.${field.name}`,
          ),
        );
      }
    });
  }
  return paths;
};

const StringWidget = ({ descriptor, name, control }: SchemaWidgetProps) => {
  const shared = {
    name,
    control,
    label: descriptor.label,
    description: descriptor.description,
    required: descriptor.required,
  };
  // Multiline wins over secret: there is no masked textarea, so a multiline
  // credential (PEM private key) stays a plain textarea for now.
  if (descriptor.multiline) return <TextareaController {...shared} />;
  if (descriptor.secret) {
    return (
      <SecretWidget descriptor={descriptor} name={name} control={control} />
    );
  }
  return <InputController {...shared} type="text" />;
};

/** Masked input with a reveal toggle for credential-bearing fields
 *  (`secret: true` marker, app contract's `format: password`). The toggle
 *  only affects local display, never the stored value. */
const SecretWidget = ({ descriptor, name, control }: SchemaWidgetProps) => {
  const { t } = useTranslation("common");
  const [revealed, setRevealed] = useState(false);
  const { field, fieldState } = useController({ name, control });
  return (
    <FieldShell
      id={name}
      invalid={fieldState.invalid}
      label={descriptor.label}
      description={descriptor.description}
      error={fieldState.error}
      required={descriptor.required}
    >
      <div className="relative">
        <Input
          id={name}
          aria-invalid={fieldState.invalid}
          aria-required={descriptor.required}
          autoComplete="off"
          type={revealed ? "text" : "password"}
          className="pr-9"
          {...field}
          value={(field.value as string | undefined) ?? ""}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute inset-y-0 right-0 h-full w-9 text-muted-foreground"
          aria-label={t(
            revealed ? "schemaForm.hideSecret" : "schemaForm.showSecret",
          )}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </FieldShell>
  );
};

const NumberWidget = ({ descriptor, name, control }: SchemaWidgetProps) => (
  <InputController
    name={name}
    control={control}
    label={descriptor.label}
    description={descriptor.description}
    required={descriptor.required}
    type="number"
  />
);

const BooleanWidget = ({ descriptor, name, control }: SchemaWidgetProps) => (
  <SwitchController
    name={name}
    control={control}
    label={descriptor.label}
    description={descriptor.description}
    required={descriptor.required}
  />
);

const EnumWidget = ({ descriptor, name, control }: SchemaWidgetProps) => (
  <SelectController
    name={name}
    control={control}
    label={descriptor.label}
    description={descriptor.description}
    required={descriptor.required}
    options={(descriptor.enumValues ?? []).map((value) => ({
      value,
      label: toLabel(String(value)),
    }))}
  />
);

const boundedInteger = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

const emptyScalarValue = (field: FieldDescriptor): unknown => {
  if (field.default !== undefined) return field.default;
  return field.kind === "boolean" ? false : "";
};

const newArrayItemValue = (item: ArrayItemDescriptor): unknown => {
  if (item.kind === "scalar") return emptyScalarValue(item.field);
  return Object.fromEntries(
    item.fields.flatMap((field) => {
      if (field.default !== undefined) return [[field.name, field.default]];
      if (field.required && field.kind === "boolean") {
        return [[field.name, false]];
      }
      return [];
    }),
  );
};

const messageAtPath = (errors: unknown, path: string): string | undefined => {
  let value = errors;
  for (const segment of path.split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  if (typeof value !== "object" || value === null) return undefined;
  const message = (value as Record<string, unknown>).message;
  return typeof message === "string" ? message : undefined;
};

const ArrayItemFields = ({
  item,
  name,
  index,
  control,
}: {
  item: ArrayItemDescriptor;
  name: string;
  index: number;
  control: Control<FieldValues>;
}) => {
  const { t } = useTranslation("common");
  const rowName = `${name}.${index}`;

  if (item.kind === "scalar") {
    return (
      <SchemaFieldWidget
        descriptor={{
          ...item.field,
          label: t("schemaForm.itemLabel", { index: index + 1 }),
          description: undefined,
        }}
        name={rowName}
        control={control}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {item.fields.map((field) => (
        <SchemaFieldWidget
          key={field.name}
          descriptor={field}
          name={`${rowName}.${field.name}`}
          control={control}
        />
      ))}
    </div>
  );
};

/** Repeatable rows for scalar items and deliberately flat object items. */
const ArrayWidget = ({ descriptor, name, control }: SchemaWidgetProps) => {
  const { t } = useTranslation("common");
  const { errors } = useFormState({ control });
  const { fields, append, remove } = useFieldArray({
    control,
    name: name as FieldArrayPath<FieldValues>,
  });
  const item = descriptor.arrayItem;
  if (!item) return <UnsupportedWidget {...{ descriptor, name, control }} />;

  const minItems = boundedInteger(descriptor.schema.minItems) ?? 0;
  const maxItems = boundedInteger(descriptor.schema.maxItems);
  const canRemove = fields.length > minItems;
  const canAdd = maxItems === undefined || fields.length < maxItems;

  return (
    <FieldSet className="gap-3 md:col-span-2">
      <FieldLegend className="mb-0" variant="label">
        {descriptor.label}{" "}
        {descriptor.required && <span aria-hidden="true">*</span>}
      </FieldLegend>
      {descriptor.description && (
        <FieldDescription>{descriptor.description}</FieldDescription>
      )}

      {fields.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {t("schemaForm.emptyArray")}
        </div>
      ) : (
        <div className="grid gap-3">
          {fields.map((field, index) => {
            const rowName = `${name}.${index}`;
            return (
              <div
                key={field.id}
                data-slot="array-field-row"
                className="grid gap-4 rounded-md border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {t("schemaForm.itemLabel", { index: index + 1 })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("schemaForm.removeItem", {
                      index: index + 1,
                    })}
                    disabled={!canRemove}
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <ArrayItemFields
                  item={item}
                  name={name}
                  index={index}
                  control={control}
                />
                {item.kind === "object" && (
                  <FieldError>{messageAtPath(errors, rowName)}</FieldError>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FieldError>{messageAtPath(errors, name)}</FieldError>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={() => append(newArrayItemValue(item))}
        >
          <Plus />
          {t("schemaForm.addItem")}
        </Button>
      </div>
    </FieldSet>
  );
};

/** Explicit placeholder for shapes the dialect can't render — never a silent
 *  skip. The field's stored value round-trips untouched. */
const UnsupportedWidget = ({ descriptor, name }: SchemaWidgetProps) => {
  const { t } = useTranslation("common");
  useEffect(() => {
    if (import.meta.env.DEV) {
      // A schema served a shape the form dialect can't render.
      // eslint-disable-next-line no-console -- dev-only diagnostic
      console.warn(
        `SchemaFields: unsupported schema shape for field "${name}"`,
        descriptor.schema,
      );
    }
  }, [name, descriptor.schema]);
  return (
    <div data-slot="field" className="grid gap-2">
      <span className="text-sm font-medium">{descriptor.label}</span>
      <p className="text-sm text-muted-foreground">
        {t("schemaForm.unsupportedField")}
      </p>
    </div>
  );
};

/** kind → widget. `unsupported` is the catch-all. */
const registry: Record<FieldKind, ComponentType<SchemaWidgetProps>> = {
  string: StringWidget,
  number: NumberWidget,
  integer: NumberWidget,
  boolean: BooleanWidget,
  enum: EnumWidget,
  array: ArrayWidget,
  unsupported: UnsupportedWidget,
};

/** Renders one descriptor through the registry — the single dispatch point
 *  shared by `SchemaFields` and the legacy `SchemaField` bridge. */
export const SchemaFieldWidget = (props: SchemaWidgetProps) => {
  const Widget = registry[props.descriptor.kind];
  return <Widget {...props} />;
};

interface SchemaFieldsProps {
  fields: FieldDescriptor[];
  control: Control<FieldValues>;
  /** Prepended to every field name, e.g. `"config."`. */
  namePrefix?: string;
  overrides?: SchemaFieldOverrides;
}

/** Embeddable schema-driven field list: renders inside any `<form>` (no form
 *  element of its own), so consumers keep their layout and submit wiring —
 *  e.g. the transports base+config two-form split. */
export const SchemaFields = ({
  fields,
  control,
  namePrefix = "",
  overrides,
}: SchemaFieldsProps) => (
  <>
    {fields.map((descriptor) => {
      const Widget = overrides?.[descriptor.name] ?? SchemaFieldWidget;
      return (
        <Widget
          key={descriptor.name}
          descriptor={descriptor}
          name={`${namePrefix}${descriptor.name}`}
          control={control}
        />
      );
    })}
  </>
);
