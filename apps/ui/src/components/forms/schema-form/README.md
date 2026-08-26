# Form-schema dialect

`schema-form` renders a deliberately small JSON Schema dialect. This document
is the contract between backend models that publish schemas and the generic UI
builder in this directory.

First-party schemas are checked in `packages/api/tests/test_form_schema_dialect.py`.
If that guardrail fails, either reshape the backend field into this dialect or
extend the dialect deliberately: add a descriptor kind, its widget and
validation behavior, tests, and this document in the same change.

## First-party schema contract

The root is an object with `properties`. Property names must be `snake_case`;
the builder uses each name verbatim as the form key and API payload key. A
property is required only when its name appears in the root `required` array.

Generic fields support these shapes:

| Shape                         | Rendering and validation                                            |
| ----------------------------- | ------------------------------------------------------------------- |
| `type: string`                | Text input; supports `pattern`, `minLength`, and `maxLength`        |
| `type: integer`               | Number input; supports `minimum`, `maximum`, and `exclusiveMinimum` |
| `type: number`                | Number input; supports `minimum`, `maximum`, and `exclusiveMinimum` |
| `type: boolean`               | Switch                                                              |
| `enum` on a supported scalar  | Select; values must be strings or numbers                           |
| `type: array` of a scalar     | Repeatable scalar rows; supports `minItems` and `maxItems`          |
| `type: array` of flat objects | Repeatable rows whose properties are supported scalars              |

`title`, `description`, and `examples` are display metadata. Pydantic's
`strip_whitespace` schema annotation may pass through, but trimming remains a
backend validation concern.

### Optionals and defaults

Pydantic optionals must use exactly `anyOf: [T, {"type": "null"}]` (branch
order does not matter). Other `anyOf`, `oneOf`, and `allOf` unions are outside
the first-party dialect.

A non-null `default` seeds the form value. `false`, `0`, and the empty string
are real defaults and must be preserved. `default: null` means there is no UI
seed; it does not make a field required. A field in `required` with no default
is intentionally left for the user to enter, such as the M-Bus `port`.

### References and the current nesting cap

Only local references of the form `#/$defs/Name` are resolved. A reference is
valid when it resolves to a shape allowed at that position: normally a scalar
or enum (for example a Pydantic `StrEnum`), or a flat object used as an array
item. Reference siblings such as `default` are preserved.

A root property cannot currently resolve to `type: object`. Dictionaries and
nested Pydantic models therefore fail the backend guardrail. An object is
allowed only as the direct item of a root array, and every property in that
object must be scalar; arrays or objects nested inside that row are rejected.

This is a current rendering limit, not a permanent ban on object schemas. Lift
it through a dialect extension that introduces an `object` descriptor kind and
a matching widget, rather than weakening the guardrail before the UI can
render the shape.

`ChangeEventTrigger` is the sole first-party exemption. Its nested `Condition`
is rendered by the dedicated `ChangeEventForm` and `ConditionEditor`, never by
the generic pipeline. New nested triggers are not exempt automatically.

### Vendor markers

Vendor keywords must remain domain-neutral:

- `multiline: true` on a string renders a textarea (used by MQTT PEM fields).
- `secret: true` on a string renders a masked input with a reveal toggle
  (KNX IP-Secure passwords, the MQTT password, the webhook secret). The app
  contract's `format: password` maps onto the same widget. When a field
  carries both `secret` and `multiline` (a PEM private key), `multiline`
  wins: there is no masked textarea yet, so the value renders unmasked.

## Server errors

`applyServerFieldErrors(form, error, options)` maps a `GridoneError` onto a
schema form: 422 `{loc, msg, type}` items land on the deepest registered path
in `options.fieldNames` (pass `schemaFieldPaths(fields, form.getValues())` to
register indexed array rows; leave `unsupported`-kind descriptors out — their
placeholder renders no error slot, so their errors must reach the banner).
Everything unmatched — model-level `loc: []`, unknown fields, string details,
unknown failures — becomes a `root.server` error rendered by
`ServerErrorAlert`, plus a toast. `useClearServerErrorOnChange(form)` clears
the banner on the next edit (react-hook-form does not clear root errors by
itself). Non-form surfaces use `serverErrorMessage` from
`@/lib/serverErrorMessage` instead. Full contract: ADR 0002.

## Third-party app schemas

Apps serve their own `config_schema` from `GET {api_url}/config/schema`.
Gridone does not know their field names and cannot include those schemas in the
backend CI guardrail. The dialect is therefore a published contract for apps,
while rendering remains best-effort: unsupported fields show the generic
placeholder and warning, and unsupported validator constructs fall back to
server-side validation. The app's configuration endpoint remains authoritative
and its `422` errors are shown on the form.

App schemas add five extensions, prepared in
`apps/ui/src/lib/appConfigSchema.ts` before entering the shared builder:

| Extension                           | Meaning                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Root `i18n` catalog                 | `title` and `description` are looked up by exact locale, then base language, then used literally                                         |
| `format: asset-id`                  | Asset selector; single for a string and multiple for an array                                                                            |
| `format: device-id`                 | Device selector on a string only (no array support yet); `device_type` (optional, single value) restricts candidates to that device type |
| `format: password`                  | Masked secret input with a reveal toggle — same widget as the first-party `secret: true` marker                                          |
| `oneOf` with a `const` discriminant | A selector chooses a branch, whose fields are flattened into the root form                                                               |

Discriminated branches must remain flat. They are flattened before Zod
conversion because converting the canonical branch objects directly as a union
would reject otherwise valid payloads and produce errors on the union instead
of the fields.
