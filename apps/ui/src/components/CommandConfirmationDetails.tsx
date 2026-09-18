import type { UnitCommand } from "@gridone/sdk";
import { attributeValueText } from "@/lib/attributeValueLabel";
import { useTranslation } from "react-i18next";

/** Historical evidence stays readable even when the device no longer responds. */
export function CommandConfirmationDetails({
  command,
}: {
  command: UnitCommand;
}) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const context = command.ui_confirmation;
  if (!context) return null;
  const previous = !context.previous_value_known
    ? t("confirmation.unknown")
    : attributeValueText(command.attribute, context.previous_value, tCommon);
  return (
    <div className="space-y-2 border-t pt-2 text-sm">
      <p className="font-medium">{t("confirmation.accepted")}</p>
      <p className="mt-2 whitespace-pre-wrap">{context.message}</p>
      <p>
        {t("groups.before")}: {previous}
      </p>
      <p>
        {t("groups.after")}:{" "}
        {attributeValueText(command.attribute, command.value, tCommon)}
      </p>
      {command.status === "error" && command.validation?.eligible !== false && (
        <p className="mt-2 text-muted-foreground">
          {t("confirmation.noResponse")}
        </p>
      )}
    </div>
  );
}
