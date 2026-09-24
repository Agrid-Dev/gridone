import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AutomationDeactivation } from "@gridone/sdk";

export function AutomationStatusBadge({
  enabled,
  deactivation,
}: {
  enabled: boolean;
  deactivation?: AutomationDeactivation | null;
}) {
  const { t } = useTranslation("automations");
  return (
    <Badge variant={enabled ? "success" : "secondary"}>
      {t(
        deactivation?.source === "circuit_breaker"
          ? "deactivation.breaker"
          : enabled
            ? "enabledBadge"
            : "disabledBadge",
      )}
    </Badge>
  );
}
