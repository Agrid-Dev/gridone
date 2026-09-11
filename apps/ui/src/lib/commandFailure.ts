import type { TFunction } from "i18next";

const codes = [
  "not_writable",
  "invalid_value",
  "unreachable",
  "unconfirmed",
  "not_found",
  "failed",
] as const;
type FailureCode = (typeof codes)[number];

/** Old technical error strings are never rendered as user-facing explanations. */
export function commandFailureLabel(
  t: TFunction<"devices">,
  reason?: string | null,
): string {
  const code: FailureCode = codes.includes(reason as FailureCode)
    ? (reason as FailureCode)
    : "failed";
  return t(`commands.failure.${code}`);
}
