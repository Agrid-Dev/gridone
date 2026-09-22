import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { AutomationSuspension } from "@gridone/sdk";

export function AutomationStatusBadge({
  enabled,
  suspension,
}: {
  enabled: boolean;
  suspension?: AutomationSuspension | null;
}) {
  const { t } = useTranslation("automations");
  return (
    <Badge variant={enabled ? "success" : "secondary"}>
      {t(
        suspension
          ? suspension.source === "circuit_breaker"
            ? "suspension.breaker"
            : "suspension.badge"
          : enabled
            ? "enabledBadge"
            : "disabledBadge",
      )}
    </Badge>
  );
}
