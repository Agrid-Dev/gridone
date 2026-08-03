import type { Control, FieldValues } from "react-hook-form";
import {
  normalizeProperty,
  SchemaFieldWidget,
  type JsonSchemaObject,
} from "./schema-form";

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

/** Legacy single-property bridge over the `schema-form` widget registry, kept
 *  for consumers not yet on `SchemaFields` (widget config: follow-up; app
 *  config: AGR-920). New consumers should use `SchemaFields` directly. */
export function SchemaField({
  name,
  propName,
  schema,
  control,
  required,
}: SchemaFieldProps) {
  const descriptor = normalizeProperty(propName, schema as JsonSchemaObject, {
    required,
  });
  return (
    <SchemaFieldWidget descriptor={descriptor} name={name} control={control} />
  );
}
