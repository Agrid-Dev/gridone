import { useTranslation } from "react-i18next";
import type { AutomationDeactivation } from "@gridone/sdk";

/** Why an automation was stopped. A tripped guard gives a reason code, shown
 *  translated (or as the raw code if unknown); an operator's reason is free
 *  text, shown as typed even when it happens to match a code. */
export function DeactivationReason({
  deactivation,
}: {
  deactivation: AutomationDeactivation;
}) {
  const { t } = useTranslation("automations");
  const { reason } = deactivation;
  if (!reason) return null;
  return deactivation.source === "circuit_breaker"
    ? t(`reasons.${reason}`, { defaultValue: reason })
    : reason;
}
