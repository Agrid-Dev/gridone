import { useEffect, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { Control, FieldValues } from "react-hook-form";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { toLabel } from "@/lib/textFormat";
import type { FieldDescriptor, FieldKind } from "./types";

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

const StringWidget = ({ descriptor, name, control }: SchemaWidgetProps) => {
  const shared = {
    name,
    control,
    label: descriptor.label,
    description: descriptor.description,
    required: descriptor.required,
  };
  if (descriptor.multiline) return <TextareaController {...shared} />;
  return <InputController {...shared} type="text" />;
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

/** Explicit placeholder for shapes the flat dialect can't render (nested
 *  objects — the dialect stays flat — and arrays until AGR-922) — never a
 *  silent skip. The field's stored value round-trips untouched. */
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

/** kind → widget. `unsupported` is the catch-all; future kinds (`object`,
 *  arrays) extend this table. */
const registry: Record<FieldKind, ComponentType<SchemaWidgetProps>> = {
  string: StringWidget,
  number: NumberWidget,
  integer: NumberWidget,
  boolean: BooleanWidget,
  enum: EnumWidget,
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
