import { useEffect } from "react";
import { normalizeError, type ValidationErrorItem } from "@gridone/sdk";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

export interface ServerLocationOptions {
  /** Container keys owned by the endpoint rather than the rendered form. */
  prefixes?: readonly string[];
  /** One pydantic discriminated-union tag, e.g. a transport protocol. */
  unionTag?: string;
}

export interface ApplyServerFieldErrorsOptions extends ServerLocationOptions {
  /** RHF paths rendered by this schema-form consumer. */
  fieldNames: readonly string[];
  /** Safe message used for unknown failures and for the fallback toast. */
  fallbackMessage: string;
  /** Preserve a consumer's existing toast wording for known server messages. */
  toastMessage?: (serverMessage: string | undefined) => string;
}

export interface AppliedServerFieldErrors {
  appliedPaths: string[];
  unmatched: ValidationErrorItem[];
}

/**
 * Remove only endpoint scopes explicitly declared by the caller.
 *
 * FastAPI prepends `body`, discriminated unions add one tag (for example
 * `mqtt`), and embedded payloads add container keys such as `config`. Prefixes
 * and the union tag may alternate (`trigger.<provider>.params`), so the loop
 * consumes either while still at the front. The union tag is stripped at most
 * once; all remaining segments are part of the RHF path.
 */
export function normalizeServerErrorLocation(
  loc: ValidationErrorItem["loc"],
  { prefixes = [], unionTag }: ServerLocationOptions = {},
): (string | number)[] {
  const segments = [...loc];
  if (segments[0] === "body") segments.shift();

  const prefixSet = new Set(prefixes);
  let unionTagStripped = false;
  while (segments.length > 0) {
    const first = segments[0];
    if (typeof first !== "string") break;
    if (prefixSet.has(first)) {
      segments.shift();
      continue;
    }
    if (!unionTagStripped && unionTag !== undefined && first === unionTag) {
      segments.shift();
      unionTagStripped = true;
      continue;
    }
    break;
  }
  return segments;
}

const toPath = (loc: (string | number)[]): string => loc.map(String).join(".");

/** Pick the deepest rendered field containing the server path. */
function matchingField(path: string, fieldNames: readonly string[]) {
  return fieldNames
    .filter(
      (fieldName) => path === fieldName || path.startsWith(`${fieldName}.`),
    )
    .sort((left, right) => right.split(".").length - left.split(".").length)[0];
}

function joinMessages(errors: ValidationErrorItem[]): string {
  return [...new Set(errors.map((error) => error.msg))].join("; ");
}

function surfaceRootError<T extends FieldValues>(
  form: UseFormReturn<T>,
  message: string,
  options: ApplyServerFieldErrorsOptions,
  serverMessageForToast?: string,
): void {
  form.setError("root.server", { type: "server", message });
  toast.error(
    options.toastMessage?.(serverMessageForToast) ?? options.fallbackMessage,
  );
}

/**
 * Apply a Gridone server error to a schema-driven react-hook-form instance.
 *
 * Structured locations land on the deepest registered schema field. A nested
 * array/object location falls back to its rendered ancestor (for example
 * `meters.0.point_id` -> `meters`) until nested widgets register their own
 * paths. Model-level locations, unknown fields, string-detail errors, and
 * unknown failures always become `root.server` plus a fallback toast, so no
 * server error is silently discarded.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  options: ApplyServerFieldErrorsOptions,
): AppliedServerFieldErrors {
  const normalized = normalizeError(error);
  if (normalized.kind === "message") {
    surfaceRootError(form, normalized.message, options, normalized.message);
    return { appliedPaths: [], unmatched: [] };
  }
  if (normalized.kind === "unknown") {
    surfaceRootError(form, options.fallbackMessage, options);
    return { appliedPaths: [], unmatched: [] };
  }

  const messagesByPath = new Map<string, string[]>();
  const unmatched: ValidationErrorItem[] = [];
  for (const item of normalized.errors) {
    const path = toPath(normalizeServerErrorLocation(item.loc, options));
    const fieldName =
      path === "" ? undefined : matchingField(path, options.fieldNames);
    if (fieldName === undefined) {
      unmatched.push(item);
      continue;
    }
    const messages = messagesByPath.get(fieldName) ?? [];
    messages.push(item.msg);
    messagesByPath.set(fieldName, messages);
  }

  for (const [path, messages] of messagesByPath) {
    form.setError(path as Path<T>, {
      type: "server",
      message: [...new Set(messages)].join("; "),
    });
  }

  if (unmatched.length > 0) {
    if (import.meta.env.DEV) {
      // A server loc matched no rendered field — usually a leaked payload key
      // (extra_forbidden) or a field the dialect can't render.
      // eslint-disable-next-line no-console -- dev-only diagnostic
      console.error(
        "applyServerFieldErrors: unmatched server error locations",
        unmatched.map((item) => item.loc),
      );
    }
    surfaceRootError(form, joinMessages(unmatched), options);
  }

  return { appliedPaths: [...messagesByPath.keys()], unmatched };
}

/** Root server errors clear as soon as the user edits a schema field. */
export function useClearServerErrorOnChange<T extends FieldValues>(
  form: UseFormReturn<T>,
): void {
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name !== undefined) form.clearErrors("root.server");
    });
    return () => subscription.unsubscribe();
  }, [form]);
}
