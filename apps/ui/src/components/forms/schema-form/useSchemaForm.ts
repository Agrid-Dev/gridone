import { useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type * as z from "zod";
import { buildZodSchema } from "./buildZodSchema";
import { normalizeSchema } from "./normalizeSchema";
import { useClearServerErrorOnChange } from "./serverErrors";
import type { NormalizedSchema } from "./types";

export type SchemaFormValues = Record<string, unknown>;

/** Schema-declared defaults merged **under** entity values: on edit the stored
 *  value wins, the schema fills the gaps. Entity `null`s are treated as absent
 *  (pydantic's optional-T serializes unset fields as `null`). Values for
 *  unsupported fields are kept so they round-trip untouched on submit. */
export const schemaFormDefaults = (
  normalized: NormalizedSchema,
  values?: SchemaFormValues,
): SchemaFormValues => {
  const defaults: SchemaFormValues = {};
  for (const field of normalized.fields) {
    if (field.default !== undefined) defaults[field.name] = field.default;
    else if (field.kind === "array") defaults[field.name] = [];
  }
  for (const [name, value] of Object.entries(values ?? {})) {
    if (value !== null && value !== undefined) defaults[name] = value;
  }
  return defaults;
};

export interface UseSchemaFormOptions {
  /** The JSON Schema driving the form (an object schema with `properties`). */
  schema: unknown;
  /** Entity values on edit; merged over the schema defaults. */
  values?: SchemaFormValues;
  mode?: "onSubmit" | "onBlur" | "onChange" | "onTouched" | "all";
}

/** RHF instance wired to a schema-driven zod resolver, plus the normalized
 *  field descriptors for `SchemaFields` and the computed default values
 *  (exposed so consumers can `reset(defaultValues)` when the schema changes —
 *  e.g. the transports form on protocol switch). */
export const useSchemaForm = ({
  schema,
  values,
  mode,
}: UseSchemaFormOptions) => {
  const normalized = useMemo(() => normalizeSchema(schema), [schema]);
  const zodSchema = useMemo(() => buildZodSchema(normalized), [normalized]);
  const defaultValues = useMemo(
    () => schemaFormDefaults(normalized, values),
    [normalized, values],
  );
  // The schema only exists at runtime, so its static type is unknown — align
  // the resolver with the generic values shape.
  const resolver = zodResolver(
    zodSchema as unknown as z.ZodType<SchemaFormValues, SchemaFormValues>,
  ) as Resolver<SchemaFormValues>;
  const form = useForm<SchemaFormValues>({ resolver, mode, defaultValues });
  useClearServerErrorOnChange(form);
  return { form, fields: normalized.fields, defaultValues };
};
