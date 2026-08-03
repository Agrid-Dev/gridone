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
- `{kind: "message", message}` — string `detail` on a 4xx or 502;
- `{kind: "unknown"}` — everything else (5xx, network/status 0, malformed
  bodies, non-Gridone errors). Callers show a generic fallback for these.

### Layer 2 — form application (`apps/ui/src/lib/forms/serverErrors.ts`)

- `setServerFieldErrors(form, errors)` — for each item, derives candidate
  react-hook-form paths from `loc` (drop `body`, then progressively strip
  leading segments; each candidate also gets a camelCase variant) and calls
  `setError(path, {type: "server", msg})` on the first candidate that exists
  in `form.getValues()` (public API only — no private RHF internals). Returns
  the **orphans**: items that matched no field (e.g. `extra_forbidden` on a
  leaked key, AGR-807's `device_id`).
- `applyServerErrors(form, err, {fallbackMessage, surface})` — the one-call
  path for a submit handler: field errors → fields; orphans → fallback +
  `console.error` in dev; `message` → `surface` (`root` sets a
  `root.server` form error, default; `toast` uses sonner); `unknown` →
  fallback. Returns the orphans so callers can route them further.

Server errors set via `setError` are cleared by react-hook-form on the next
resolver run for that field, so no explicit cleanup is needed.

### Reference adopter

The transports form (create/edit) is the reference. It temporarily runs two
RHF instances inside one `<form>` (base fields + schema-driven config — a
split AGR-919 keeps), so it composes Layer 1 + `setServerFieldErrors` (config
fields first, then base fields, remainder → toast) instead of the single-form
`applyServerErrors` convenience. Single-RHF-instance forms should use
`applyServerErrors`; rollout is AGR-921.

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

- 5xx/network details never reach users; 4xx domain messages do; validation
  errors land on their fields with the orphan escape hatch.
- The SDK never throws away the response body, so future consumers (CLI, MCP)
  can build their own presentation on `rawDetail`/`validationErrors`.
- The `loc`-to-field matching is heuristic (prefix stripping); forms with
  colliding field names across nesting levels should prefer registering the
  full path. `loc` contracts per form are AGR-921's scope.
