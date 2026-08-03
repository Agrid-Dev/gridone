/**
 * One entry of a FastAPI/pydantic 422 validation error array:
 * `{"detail": [{"loc": ["body", "config", "host"], "msg": "...", "type": "..."}]}`.
 * `loc` mixes strings (object keys, scope prefixes like `"body"`, discriminator
 * tags) and numbers (array indices).
 */
export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
}

function isValidationErrorItem(value: unknown): value is ValidationErrorItem {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    Array.isArray(item.loc) &&
    item.loc.every(
      (segment) => typeof segment === "string" || typeof segment === "number",
    ) &&
    typeof item.msg === "string" &&
    typeof item.type === "string"
  );
}

/**
 * Parses a response `detail` into validation items — only when it is a
 * non-empty array where every entry matches the `{loc, msg, type}` contract.
 * Anything else (string detail, malformed items) yields `undefined`.
 */
function parseValidationErrors(
  detail: unknown,
): ValidationErrorItem[] | undefined {
  if (!Array.isArray(detail) || detail.length === 0) {
    return undefined;
  }
  return detail.every(isValidationErrorItem) ? detail : undefined;
}

/** `detail` as a display string; non-strings are stringified (back-compat). */
function detailToString(detail: unknown): string {
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}

/** Error raised when the Gridone API responds with a non-2xx status. */
export class GridoneError extends Error {
  readonly status: number;
  /** Body `detail` as a string; structured details arrive JSON-stringified. */
  readonly detail: string;
  /** Body `detail` exactly as the server sent it. */
  readonly rawDetail: unknown;
  /** Parsed entries when `detail` is a well-formed 422 validation array. */
  readonly validationErrors?: ValidationErrorItem[];

  constructor(status: number, detail: unknown, options?: ErrorOptions) {
    const detailString = detailToString(detail);
    super(`HTTP ${status}: ${detailString}`, options);
    this.name = "GridoneError";
    this.status = status;
    this.detail = detailString;
    this.rawDetail = detail;
    this.validationErrors = parseValidationErrors(detail);
  }
}

/**
 * Error raised when no response was received at all (DNS failure, timeout,
 * connection refused). `status` is 0, following the XHR convention for
 * requests that never reached the server.
 */
export class NetworkError extends GridoneError {
  constructor(detail = "Network request failed", options?: ErrorOptions) {
    super(0, detail, options);
    this.name = "NetworkError";
  }
}

export function isGridoneError(error: unknown): error is GridoneError {
  return error instanceof GridoneError;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof GridoneError && error.status === 404;
}

/**
 * An API failure reduced to what a form (or any error surface) should do
 * with it, per ADR 0002: apply field errors, show a message, or fall back
 * to a generic one.
 */
export type NormalizedError =
  | { kind: "fieldErrors"; errors: ValidationErrorItem[] }
  | { kind: "message"; message: string }
  | { kind: "unknown" };

/**
 * Classifies an error by the *shape of* the response `detail`, not the
 * status code (a 422 carries either a validation array or a domain message):
 *
 * - well-formed validation array → `fieldErrors`
 * - string detail on a 4xx, 502 or 503 → `message` (Gridone's own 502/503
 *   bodies are server-authored constants — e.g. the app-fault 503s
 *   "App is unreachable" / "App returned an invalid config schema" — so
 *   surfacing them is deliberate, not a leak)
 * - everything else (500/other 5xx, network, malformed body, non-Gridone
 *   errors) → `unknown`, so raw server text is never surfaced to users.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (!isGridoneError(error)) {
    return { kind: "unknown" };
  }
  if (error.validationErrors) {
    return { kind: "fieldErrors", errors: error.validationErrors };
  }
  const clientError = error.status >= 400 && error.status < 500;
  const gatewayError = error.status === 502 || error.status === 503;
  if (typeof error.rawDetail === "string" && (clientError || gatewayError)) {
    return { kind: "message", message: error.rawDetail };
  }
  return { kind: "unknown" };
}
