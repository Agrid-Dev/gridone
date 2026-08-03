import { normalizeError, type ValidationErrorItem } from "@gridone/sdk";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

/**
 * Where `applyServerErrors` surfaces non-field messages: `root` sets a
 * `root.server` error on the form (render it near the submit button),
 * `toast` shows a sonner error toast.
 */
export type ErrorSurface = "root" | "toast";

export type ApplyServerErrorsOptions = {
  /** Generic message for `unknown` errors and orphaned field errors. */
  fallbackMessage: string;
  surface?: ErrorSurface;
};

/**
 * Converts a backend `loc` (e.g. `["body", "mqtt", "config", "host"]`) into
 * candidate react-hook-form paths, most specific first. Leading segments are
 * scope prefixes the form doesn't know about (`body`, pydantic discriminator
 * tags, container keys of an embedded sub-form), so each strip level is a
 * candidate: `mqtt.config.host`, `config.host`, `host`. Backend keys are
 * snake_case; each candidate also gets a camelCase variant for forms that
 * renamed their fields.
 */
function candidatePaths(loc: ValidationErrorItem["loc"]): string[] {
  const segments = (loc[0] === "body" ? loc.slice(1) : loc).map(String);
  const candidates: string[] = [];
  for (let start = 0; start < segments.length; start += 1) {
    const path = segments.slice(start).join(".");
    const camelized = segments
      .slice(start)
      .map((segment) =>
        segment.replace(/_([a-z0-9])/g, (_, char: string) =>
          char.toUpperCase(),
        ),
      )
      .join(".");
    candidates.push(path);
    if (camelized !== path) {
      candidates.push(camelized);
    }
  }
  return candidates;
}

/**
 * True when `path` (dot-separated) exists as a key chain in the form values —
 * the "is this field registered" check, done through public form state only.
 */
function hasPath(values: FieldValues, path: string): boolean {
  let node: unknown = values;
  for (const segment of path.split(".")) {
    if (node === null || typeof node !== "object" || !(segment in node)) {
      return false;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return true;
}

/**
 * Sets each validation error on the matching registered form field and
 * returns the orphans — errors whose `loc` matches no field (e.g.
 * `extra_forbidden` on a key the form never renders). The caller decides how
 * to surface those.
 */
export function setServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  errors: ValidationErrorItem[],
): ValidationErrorItem[] {
  const values = form.getValues();
  const orphans: ValidationErrorItem[] = [];
  for (const error of errors) {
    const path = candidatePaths(error.loc).find((candidate) =>
      hasPath(values, candidate),
    );
    if (path === undefined) {
      orphans.push(error);
      continue;
    }
    form.setError(path as Path<T>, { type: "server", message: error.msg });
  }
  return orphans;
}

/**
 * Dev-console visibility for field errors that matched no field — usually a
 * payload key the form never renders (e.g. AGR-807's leaked `device_id`).
 */
export function reportOrphanedServerErrors(
  orphans: ValidationErrorItem[],
): void {
  if (orphans.length > 0 && import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- dev-only diagnostic, per ADR 0002
    console.error("Server field errors matched no form field", orphans);
  }
}

function surfaceMessage<T extends FieldValues>(
  form: UseFormReturn<T>,
  surface: ErrorSurface,
  message: string,
): void {
  if (surface === "toast") {
    toast.error(message);
  } else {
    form.setError("root.server", { type: "server", message });
  }
}

/**
 * One-call server-error handling for a single-form submit (ADR 0002):
 * validation errors land on their fields; a domain message (string-detail
 * 4xx/502) or the generic fallback (5xx, network, orphaned field errors) goes
 * to the chosen surface. Returns the orphans so callers with several forms
 * can route them further.
 */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  { fallbackMessage, surface = "root" }: ApplyServerErrorsOptions,
): ValidationErrorItem[] {
  const normalized = normalizeError(error);
  if (normalized.kind === "message") {
    surfaceMessage(form, surface, normalized.message);
    return [];
  }
  if (normalized.kind === "unknown") {
    surfaceMessage(form, surface, fallbackMessage);
    return [];
  }
  const orphans = setServerFieldErrors(form, normalized.errors);
  if (orphans.length > 0) {
    reportOrphanedServerErrors(orphans);
    surfaceMessage(form, surface, fallbackMessage);
  }
  return orphans;
}
