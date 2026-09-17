import type { UnitCommand } from "@gridone/sdk";
import { useTranslation } from "react-i18next";

/** Historical evidence stays readable even when the device no longer responds. */
export function CommandConfirmationDetails({
  command,
}: {
  command: UnitCommand;
}) {
  const { t } = useTranslation("devices");
  const context = command.ui_confirmation;
  if (!context) return null;
  const previous = !context.previous_value_known
    ? t("confirmation.unknown")
    : context.value_redacted
      ? t("confirmation.masked")
      : String(context.previous_value);
  return (
    <details className="max-w-sm text-sm">
      <summary className="cursor-pointer">{t("confirmation.accepted")}</summary>
      <p className="mt-2 whitespace-pre-wrap">{context.message}</p>
      <p>
        {t("groups.before")}: {previous}
      </p>
      <p>
        {t("groups.after")}:{" "}
        {command.value_redacted
          ? t("confirmation.masked")
          : String(command.value)}
      </p>
      {command.status === "error" &&
        command.executed_at &&
        command.validation?.eligible !== false && (
          <p className="mt-2 text-muted-foreground">
            {t("confirmation.noResponse")}
          </p>
        )}
    </details>
  );
}
