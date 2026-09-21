import type { WriteReason } from "@gridone/sdk";
import i18n from "i18next";
import { localize } from "./localizedText";

/** Authored messages use their translations; built-in codes use the app catalog. */
export function commandReason(
  reason: WriteReason,
  language = i18n.language || "en",
): string {
  const message = reason.message
    ? localize(reason.message, language)
    : i18n.t(`devices:commandReasons.${reason.code}`, {
        defaultValue: "Command unavailable",
      });
  return reason.protection_explanation
    ? `${message} ${reason.protection_explanation}`
    : message;
}
export function commandReasons(
  reasons: readonly WriteReason[] | undefined,
  language?: string,
): string {
  return [
    ...new Set(
      (reasons ?? []).map((reason) => commandReason(reason, language)),
    ),
  ].join("; ");
}
