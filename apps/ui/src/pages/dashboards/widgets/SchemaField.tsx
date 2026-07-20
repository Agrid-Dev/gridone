import type { Control, FieldValues } from "react-hook-form";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";
import { toLabel } from "@/lib/textFormat";

/** A minimal JSON Schema node (widget config properties are flat primitives). */
export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  const?: unknown;
  enum?: unknown[];
  default?: unknown;
  pattern?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

interface SchemaFieldProps {
  /** RHF field path, e.g. `config.text`. */
  name: string;
  /** The property key, used for the fallback label. */
  propName: string;
  schema: JsonSchema;
  control: Control<FieldValues>;
  required?: boolean;
}

/** Renders one config property from its JSON Schema, mapping the primitive
 *  type/enum to the matching form control. This is the generic bridge that
 *  lets each registered widget type drive its own config form. */
export function SchemaField({
  name,
  propName,
  schema,
  control,
  required,
}: SchemaFieldProps) {
  const label = schema.title ?? toLabel(propName);
  const description = schema.description;

  if (Array.isArray(schema.enum)) {
    return (
      <SelectController
        name={name}
        control={control}
        label={label}
        description={description}
        required={required}
        options={schema.enum.map((value) => ({
          value: String(value),
          label: toLabel(String(value)),
        }))}
      />
    );
  }

  if (schema.type === "boolean") {
    return (
      <SwitchController
        name={name}
        control={control}
        label={label}
        description={description}
      />
    );
  }

  if (schema.type === "number" || schema.type === "integer") {
    return (
      <InputController
        name={name}
        control={control}
        label={label}
        description={description}
        required={required}
        type="number"
      />
    );
  }

  return (
    <InputController
      name={name}
      control={control}
      label={label}
      description={description}
      required={required}
    />
  );
}
