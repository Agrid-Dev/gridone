/**
 * Domain helpers over the JSON Schema an app serves on `GET /config/schema`.
 *
 * Gridone knows no app field names: the config form is generated from this
 * schema alone. Two extensions on top of standard JSON Schema (both ignored by
 * validators, hence handled here) drive the rendering:
 *
 *  - a root `i18n` catalog — `title`/`description` hold *keys* resolved through
 *    `i18n[locale][key]`, falling back to the literal value;
 *  - custom `format` values (`asset-id`, `password`) that pick a widget.
 *
 * `oneOf` branches are flattened against the selected discriminant rather than
 * converted as a union: the canonical branch shape carries no `type: object`,
 * so `z.fromJSONSchema` turns each branch into `z.any()`, every branch then
 * matches, and its "exactly one" oneOf semantics rejects even a valid payload.
 * Flattening also keeps validation errors attached to their field.
 *
 * These extensions (`i18n`, `asset-id`, `password`, discriminated `oneOf`) are
 * part of the form-schema dialect, not app-specific: AGR-923 documents and
 * CI-guards the dialect, and AGR-920 migrates this conversion onto the
 * `schema-form` builder (`components/forms/schema-form`, built in AGR-919).
 * Until then they live here.
 */
import * as z from "zod";

/**
 * Node of an app-declared config schema.
 *
 * Only the keywords that steer the rendering are named; an app may declare any
 * other JSON Schema keyword (`minimum`, `pattern`, …) and they flow through to
 * the validator untouched, hence the open index signature.
 */
export interface AppSchemaNode {
  type?: string;
  title?: string;
  description?: string;
  format?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  items?: AppSchemaNode;
  properties?: Record<string, AppSchemaNode>;
  required?: string[];
  oneOf?: AppSchemaNode[];
  /** Root-only label catalog: `i18n[locale][key]`. */
  i18n?: Record<string, Record<string, string>>;
  [keyword: string]: unknown;
}

/** Custom `format` values gridone maps onto a dedicated widget. */
export const ASSET_ID_FORMAT = "asset-id";
export const PASSWORD_FORMAT = "password";

/** One `oneOf` branch, keyed by the value its discriminant is pinned to. */
export interface SchemaBranch {
  value: string;
  /** Branch `title`, unresolved — the caller localizes it. */
  title?: string;
  schema: AppSchemaNode;
}

/** The `oneOf` discriminant of a schema: a property every branch pins to a
 *  distinct `const`, rendered as a dropdown that swaps the branch fields. */
export interface Discriminant {
  name: string;
  branches: SchemaBranch[];
}

/** A single form field: its schema, already localized, plus its RHF name. */
export interface SchemaFieldSpec {
  name: string;
  schema: AppSchemaNode;
  required: boolean;
}

/**
 * Resolves a `title`/`description` through the schema's root `i18n` catalog.
 *
 * Lookup order: exact locale, then its base language (`fr-CA` -> `fr`), then
 * the raw value — a title with no catalog entry displays as written.
 */
export function resolveLabel(
  value: string | undefined,
  catalog: AppSchemaNode["i18n"],
  locale: string,
): string | undefined {
  if (value === undefined || !catalog) return value;
  const base = locale.split("-")[0];
  return catalog[locale]?.[value] ?? catalog[base]?.[value] ?? value;
}

/**
 * Finds the property that discriminates the `oneOf` branches: the one pinned
 * to a `const` in *every* branch. Returns null when the schema has no `oneOf`,
 * or when no single property discriminates it (nothing sensible to render as a
 * dropdown — the branches are then ignored and only the root fields show).
 */
export function findDiscriminant(schema: AppSchemaNode): Discriminant | null {
  const oneOf = schema.oneOf;
  if (!oneOf?.length) return null;

  const candidates = Object.entries(oneOf[0].properties ?? {})
    .filter(([, node]) => node.const !== undefined)
    .map(([name]) => name);

  for (const name of candidates) {
    const branches: SchemaBranch[] = [];
    for (const branch of oneOf) {
      const pinned = branch.properties?.[name]?.const;
      if (pinned === undefined) break;
      branches.push({
        value: String(pinned),
        title: branch.title,
        schema: branch,
      });
    }
    const values = new Set(branches.map((b) => b.value));
    if (branches.length === oneOf.length && values.size === oneOf.length) {
      return { name, branches };
    }
  }
  return null;
}

/**
 * Flattens the schema against the selected branch: root properties first (in
 * declaration order), then the branch's own, with `required` unioned.
 *
 * The discriminant keeps its root definition — the branch pins it to a `const`,
 * which would otherwise replace the dropdown with a frozen single value.
 */
export function effectiveSchema(
  schema: AppSchemaNode,
  discriminantValue: string | undefined,
): AppSchemaNode {
  const discriminant = findDiscriminant(schema);
  const branch = discriminant?.branches.find(
    (b) => b.value === discriminantValue,
  )?.schema;

  const properties = { ...schema.properties };
  for (const [name, node] of Object.entries(branch?.properties ?? {})) {
    if (name === discriminant?.name) continue;
    properties[name] = node;
  }

  return {
    type: "object",
    properties,
    required: [
      ...new Set([...(schema.required ?? []), ...(branch?.required ?? [])]),
    ].filter((name) => name in properties),
  };
}

/** Ordered field specs of a flattened schema, discriminant included. */
export function fieldsOf(schema: AppSchemaNode): SchemaFieldSpec[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, node]) => ({
    name,
    schema: node,
    required: required.has(name),
  }));
}

/** Seed values for a flattened schema: every declared `default`, plus `[]` for
 *  arrays so multi-selects start controlled rather than undefined. */
export function defaultsFor(schema: AppSchemaNode): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [name, node] of Object.entries(schema.properties ?? {})) {
    if (node.default !== undefined) values[name] = node.default;
    else if (node.type === "array") values[name] = [];
  }
  return values;
}

/** Drops the values that no longer belong to the schema — switching `oneOf`
 *  branches must not submit the abandoned branch's fields (its secrets least
 *  of all), which react-hook-form still holds. */
export function pickSchemaKeys(
  values: Record<string, unknown>,
  schema: AppSchemaNode,
): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const name of Object.keys(schema.properties ?? {})) {
    if (values[name] !== undefined) picked[name] = values[name];
  }
  return picked;
}

/**
 * Converts a flattened schema to a zod validator for inline field errors.
 *
 * Apps serve their own schemas, so conversion can fail on a construct zod does
 * not implement. That must not take the form down: the fallback accepts
 * anything and leaves validation to `PATCH /apps/{id}/config`, which is the
 * authority either way (its 422 is surfaced on the form).
 */
export function toZodSchema(schema: AppSchemaNode): z.ZodObject {
  try {
    // Custom formats (`asset-id`) need no zod counterpart: they select the
    // widget, not the validation, and zod passes unknown formats through.
    // The input is always a flattened object schema, hence the object cast.
    return z.fromJSONSchema(
      schema as Parameters<typeof z.fromJSONSchema>[0],
    ) as z.ZodObject;
  } catch {
    return z.looseObject({});
  }
}
