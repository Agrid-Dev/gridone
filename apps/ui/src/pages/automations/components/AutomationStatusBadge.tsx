import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export function AutomationStatusBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation("automations");
  return (
    <Badge variant={enabled ? "success" : "secondary"}>
      {t(enabled ? "enabledBadge" : "disabledBadge")}
    </Badge>
  );
}
