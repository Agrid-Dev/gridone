import { normalizeError } from "@gridone/sdk";

/**
 * Server-authored text safe to show on a non-form surface (toast, inline
 * alert), or `undefined` when only the caller's generic fallback should
 * appear (`normalizeError` "unknown": 500s, network failures, malformed
 * bodies — per ADR 0002, raw server text for those never reaches users).
 *
 * Validation arrays flatten to readable `field: message` lines instead of
 * the JSON blob `GridoneError.detail` carries. Forms should keep using
 * `applyServerFieldErrors`, which maps those onto their fields.
 */
export function serverErrorMessage(error: unknown): string | undefined {
  const normalized = normalizeError(error);
  if (normalized.kind === "message") return normalized.message;
  if (normalized.kind === "unknown") return undefined;
  const lines = normalized.errors.map((item) => {
    const field = item.loc
      .filter((segment): segment is string => typeof segment === "string")
      .filter((segment) => segment !== "body")
      .pop();
    return field ? `${field}: ${item.msg}` : item.msg;
  });
  return [...new Set(lines)].join("; ");
}
