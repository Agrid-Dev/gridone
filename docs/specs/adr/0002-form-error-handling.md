# ADR 0002 — Structured form error handling

- **Status**: Accepted (2026-08-03)
- **Issues**: AGR-809 (implementation), AGR-921 (rollout), AGR-807 (motivating
  bug), AGR-993 (app-config errors adopt the same wire contract)

## Context

Form error handling in the UI was ad-hoc: each mutation hook re-derived its own
`onError`, and the common shape was `toast.error(...)` on `GridoneError.detail`
or `err.message`. Field-level validation errors never reached the field they
concern, and raw 5xx text could leak into toasts (CLAUDE.md §18).

This ADR originally targeted the pre-SDK `apps/ui/src/api/request.ts` /
`apiError.ts` layer. Those files no longer exist — `@gridone/sdk` (`sdk/ts`)
replaced them — so the "carry the raw body" prerequisite lands in the SDK
(retarget, 2026-07-30).

### The wire contract

Every backend error body is `{"detail": …}`, with two shapes the status code
cannot disambiguate:

| Response | `detail` shape | What the UI should do |
|---|---|---|
| Request/config validation → 422 | **array** of `{loc, msg, type}` | map to form fields |
| Domain `InvalidError` → 422 | **string** | show the message |
| 404 / 409 / 403 / 502 | string | show the message |
| 503 (app fault) | string | show the message — these bodies are gridone-authored constants ("App is unreachable", "App returned an invalid config schema") |
| 500 / other 5xx / network | anything | generic fallback — never surface raw server text |

The rule is therefore: **branch on the shape of `detail`, not on the status
code.**

`loc` is a path into the request, e.g. `["body", "mqtt", "config", "host"]`.
Leading segments can be scope prefixes (`body`), pydantic discriminator tags
(`mqtt` in `TransportCreate`'s discriminated union), or container keys a form
doesn't render; numeric segments are array indices.

## Decision

Three layers, each pure and independently testable:

### Layer 0 — SDK carries the parsed structure (`sdk/ts/src/errors.ts`)

`GridoneError` keeps `detail: string` (back-compat: non-string bodies are
JSON-stringified) and gains:

- `rawDetail: unknown` — the body `detail` exactly as sent;
- `validationErrors?: ValidationErrorItem[]` — populated only when `detail`
  is a non-empty array where **every** item matches
  `{loc: (string | number)[], msg: string, type: string}`. Malformed arrays
  parse to `undefined` and fall through to the generic fallback.

### Layer 1 — `normalizeError` (exported by the SDK)

`GridoneError | unknown` → discriminated union:

- `{kind: "fieldErrors", errors}` — well-formed validation array;
- `{kind: "message", message}` — string `detail` on a 4xx, 502 or 503
  (gridone's own 502/503 bodies are server-authored constants);
- `{kind: "unknown"}` — everything else (500/other 5xx, network/status 0,
  malformed bodies, non-Gridone errors). Callers show a generic fallback.

### Layer 2 — form application (`apps/ui/src/components/forms/schema-form/serverErrors.ts`)

- `normalizeServerErrorLocation(loc, {prefixes, unionTag})` — strips the
  `body` prefix, caller-declared container prefixes (e.g. `config`) and at
  most one discriminated-union tag, yielding a form-relative path.
- `applyServerFieldErrors(form, error, {fieldNames, fallbackMessage,
  toastMessage?, prefixes?, unionTag?})` — the one-call path for a submit
  handler. Field errors land on the **deepest matching** registered path
  (`fieldNames` — flat names, or `schemaFieldPaths(fields, getValues())`
  for indexed array rows; `unsupported`-kind descriptors must be left out,
  their placeholder renders no error slot). Everything unmatched — model-level
  locations (`loc: []`), unknown fields, string-detail errors, `unknown`
  failures — becomes a `root.server` form error (rendered by
  `ServerErrorAlert`) plus a toast, with a dev-only `console.error` listing
  the unmatched locations. Returns `{appliedPaths, unmatched}`.
- `useClearServerErrorOnChange(form)` — `root.server` does **not** clear on
  the next resolver run (react-hook-form only replaces field errors), so this
  hook clears it explicitly on the first change; field-level server errors
  clear on the next validation of their field.

Non-form surfaces (list/delete mutations, wizards) use
`apps/ui/src/lib/serverErrorMessage.ts`: `serverErrorMessage(error)` returns
server-authored text safe to toast (validation arrays flatten to
`field: message` lines) or `undefined` when only the caller's generic
fallback may be shown.

### Reference adopter

The transports form (create/edit) is the reference. It runs two RHF
instances inside one `<form>` (base fields + schema-driven config — a split
AGR-919 keeps), so it buckets `normalizeError` output itself and calls
`applyServerFieldErrors` once per instance (config first with
`prefixes: ["config"]` + the protocol as `unionTag`, then base fields).
Single-RHF-instance forms (app config, building profile, generic trigger)
call `applyServerFieldErrors` once.

## Alternatives considered

- **Multi-form routing** (one dispatcher spreading errors across several
  independent page forms) — **rejected**: pages with several forms (device
  edit) become per-category single forms instead (AGR-749). The transports
  base+config split is one logical form, not multi-form routing.
- **Branching on status codes** — rejected: 422 is ambiguous (validation
  array vs domain message); the shape of `detail` is the contract.
- **Machine-readable error `code`s for i18n** — backend contract change,
  separate issue.

## Consequences

- 500/network details never reach users (every toast site goes through
  `serverErrorMessage` or `applyServerFieldErrors`); 4xx domain messages and
  the gridone-authored 502/503 bodies do; validation errors land on their
  fields with the orphan escape hatch.
- The SDK never throws away the response body, so future consumers (CLI, MCP)
  can build their own presentation on `rawDetail`/`validationErrors`.
- The `loc`-to-field matching is heuristic (prefix stripping); forms with
  colliding field names across nesting levels should prefer registering the
  full path. `loc` contracts per form are AGR-921's scope.
