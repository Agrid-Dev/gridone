/** A JSON Schema node kept as an open bag: unknown keywords (vendor markers,
 *  pydantic extras) flow through untouched to `z.fromJSONSchema`. */
export type JsonSchemaObject = { [keyword: string]: unknown };

/** The widget-dispatch kinds the schema-form dialect supports. Objects remain
 *  unsupported at the root; a deliberately limited flat object is supported
 *  only as an array item. */
export type FieldKind =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "array"
  | "unsupported";

export type ArrayItemDescriptor =
  | {
      kind: "scalar";
      field: FieldDescriptor;
      schema: JsonSchemaObject;
    }
  | {
      kind: "object";
      fields: FieldDescriptor[];
      schema: JsonSchemaObject;
    };

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
  /** Present when `kind` is `array`; deeper item shapes are unsupported. */
  arrayItem?: ArrayItemDescriptor;
  /** Vendor marker: render a textarea instead of a single-line input. */
  multiline: boolean;
  /** Resolved, unwrapped node (constraints intact) — feeds `buildZodSchema`. */
  schema: JsonSchemaObject;
}

export interface NormalizedSchema {
  fields: FieldDescriptor[];
}
