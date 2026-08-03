/** A JSON Schema node kept as an open bag: unknown keywords (vendor markers,
 *  pydantic extras) flow through untouched to `z.fromJSONSchema`. */
export type JsonSchemaObject = { [keyword: string]: unknown };

/** The widget-dispatch kinds the flat dialect supports. `unsupported` is the
 *  extension point: nested objects (phase 2) and arrays (AGR-922) will become
 *  their own kinds instead of falling through to it. */
export type FieldKind =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "unsupported";

/** One form field derived from a JSON Schema property — the normalized,
 *  `$ref`-free unit the widget registry and zod builder operate on. */
export interface FieldDescriptor {
  /** Property key, snake_case — round-trips verbatim to the payload (AGR-373). */
  name: string;
  kind: FieldKind;
  label: string;
  description?: string;
  required: boolean;
  /** The property was declared `anyOf: [T, {type: "null"}]` (optional-T). */
  nullable: boolean;
  /** Schema-declared default, seeded as an actual form value (`undefined` when
   *  the schema declares none; a literal `null` default counts as none). */
  default?: unknown;
  /** Present when `kind` is `enum`. */
  enumValues?: Array<string | number>;
  /** Vendor marker: render a textarea instead of a single-line input. */
  multiline: boolean;
  /** Resolved, unwrapped node (constraints intact) — feeds `buildZodSchema`. */
  schema: JsonSchemaObject;
}

export interface NormalizedSchema {
  fields: FieldDescriptor[];
}
