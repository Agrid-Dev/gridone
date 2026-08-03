import { toLabel } from "@/lib/textFormat";
import type {
  FieldDescriptor,
  FieldKind,
  JsonSchemaObject,
  NormalizedSchema,
} from "./types";

const isObject = (value: unknown): value is JsonSchemaObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Resolves a local `#/$defs/Name` reference, merging the target under the
 *  node's sibling keywords (siblings win: BACnet's `default_write_priority`
 *  is `{$ref: BacnetWritePriority, default: 8}` — the default must survive).
 *  The def's `title` is dropped: it names the shared model (`AssetType`,
 *  `Condition`), not the field, so the label falls back to the
 *  property name unless the field declares its own title. Unresolvable refs
 *  return the node unchanged, which downstream classifies as `unsupported`
 *  rather than dropping the field. */
const resolveRef = (
  node: JsonSchemaObject,
  defs: JsonSchemaObject,
): JsonSchemaObject => {
  const ref = node.$ref;
  if (typeof ref !== "string") return node;
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!match) return node;
  const target = defs[match[1]];
  if (!isObject(target)) return node;
  const siblings: JsonSchemaObject = { ...node };
  delete siblings.$ref;
  const definition: JsonSchemaObject = { ...target };
  delete definition.title;
  // A def may itself alias another def; resolve transitively.
  return resolveRef({ ...definition, ...siblings }, defs);
};

/** Unwraps pydantic's optional encoding `anyOf: [T, {type: "null"}]` into T
 *  plus a `nullable` flag. Required for correct zod error paths: converting
 *  the union as-is makes zod report `invalid_union` on the parent instead of
 *  the field. Unions with several non-null branches stay as-is (unsupported). */
const unwrapNullUnion = (
  node: JsonSchemaObject,
  defs: JsonSchemaObject,
): { node: JsonSchemaObject; nullable: boolean } => {
  if (!Array.isArray(node.anyOf)) return { node, nullable: false };
  const branches = node.anyOf.filter(isObject).map((b) => resolveRef(b, defs));
  const nonNull = branches.filter((b) => b.type !== "null");
  if (branches.length !== node.anyOf.length || nonNull.length !== 1) {
    return { node, nullable: false };
  }
  const siblings: JsonSchemaObject = { ...node };
  delete siblings.anyOf;
  return {
    node: { ...nonNull[0], ...siblings },
    nullable: branches.length > nonNull.length,
  };
};

const KIND_BY_TYPE: Record<string, FieldKind> = {
  string: "string",
  number: "number",
  integer: "integer",
  boolean: "boolean",
};

const classify = (node: JsonSchemaObject): FieldKind => {
  if (Array.isArray(node.enum)) return "enum";
  // A leftover union (several non-null branches) is not a renderable primitive.
  if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf)) {
    return "unsupported";
  }
  return typeof node.type === "string"
    ? (KIND_BY_TYPE[node.type] ?? "unsupported")
    : "unsupported";
};

/** Normalizes one property node into a `FieldDescriptor`. Exposed for
 *  single-field consumers (the legacy `SchemaField` bridge). */
export const normalizeProperty = (
  name: string,
  rawNode: JsonSchemaObject,
  options: { required?: boolean; defs?: JsonSchemaObject } = {},
): FieldDescriptor => {
  const defs = options.defs ?? {};
  const resolved = resolveRef(rawNode, defs);
  const { node, nullable } = unwrapNullUnion(resolved, defs);
  const kind = classify(node);
  return {
    name,
    kind,
    label:
      typeof node.title === "string" && node.title.trim() !== ""
        ? node.title
        : toLabel(name),
    description:
      typeof node.description === "string" ? node.description : undefined,
    required: options.required ?? false,
    nullable,
    default: node.default ?? undefined,
    enumValues:
      kind === "enum"
        ? (node.enum as unknown[]).filter(
            (v): v is string | number =>
              typeof v === "string" || typeof v === "number",
          )
        : undefined,
    multiline: node.multiline === true,
    schema: node,
  };
};

/** JSON Schema object → `FieldDescriptor[]`, one per property, in declaration
 *  order. Unknown/unsupported shapes are kept (`kind: "unsupported"`), never
 *  dropped, so the form can surface them explicitly. */
export const normalizeSchema = (schema: unknown): NormalizedSchema => {
  if (!isObject(schema) || !isObject(schema.properties)) {
    return { fields: [] };
  }
  const defs = isObject(schema.$defs) ? schema.$defs : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((n): n is string => typeof n === "string")
      : [],
  );
  const fields = Object.entries(schema.properties)
    .filter((entry): entry is [string, JsonSchemaObject] => isObject(entry[1]))
    .map(([name, node]) =>
      normalizeProperty(name, node, { required: required.has(name), defs }),
    );
  return { fields };
};
