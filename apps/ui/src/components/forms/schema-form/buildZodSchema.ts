import * as z from "zod";
import type { JsonSchemaObject, NormalizedSchema } from "./types";

/** Cleared inputs come back as `""` (text) — treat that as "not provided" so
 *  optional constrained fields (pattern, minLength) validate as absent. */
const emptyAsAbsent = (value: unknown) => (value === "" ? undefined : value);

/**
 * The app's single `z.fromJSONSchema` call site for schema-driven forms
 * (experimental zod API — keep it isolated here).
 *
 * Operates on the normalized schema: the object is rebuilt from the resolved,
 * unwrapped field nodes so zod reports errors on field paths instead of
 * `invalid_union` on the parent. `unsupported` fields are excluded from
 * validation — the form can't edit them and the server stays the validation
 * authority; their values still round-trip because the object is non-strict.
 */
export const buildZodSchema = (normalized: NormalizedSchema): z.ZodObject => {
  const properties: Record<string, JsonSchemaObject> = {};
  const required: string[] = [];
  for (const field of normalized.fields) {
    if (field.kind === "unsupported") continue;
    properties[field.name] = field.schema;
    if (field.required) required.push(field.name);
  }
  const objectSchema = z.fromJSONSchema({
    type: "object",
    properties,
    required,
  }) as z.ZodObject;

  // Optional fields accept null (pydantic's optional-T round-trips `null`)
  // and treat cleared inputs as absent so their defaults re-apply on parse.
  const overrides: Record<string, z.ZodType> = {};
  for (const field of normalized.fields) {
    if (field.kind === "unsupported" || field.required) continue;
    const inner = objectSchema.shape[field.name];
    if (!inner) continue;
    overrides[field.name] = z.preprocess(
      emptyAsAbsent,
      field.nullable ? inner.nullable() : inner,
    );
  }
  return Object.keys(overrides).length > 0
    ? objectSchema.extend(overrides)
    : objectSchema;
};
