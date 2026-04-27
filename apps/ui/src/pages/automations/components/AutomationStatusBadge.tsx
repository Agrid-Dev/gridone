import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

const enabledStyles = "border-green-200 bg-green-100 text-green-800";
const disabledStyles = "border-border bg-muted text-muted-foreground";

export function AutomationStatusBadge({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation("automations");
  return (
    <Badge
      variant="outline"
      className={enabled ? enabledStyles : disabledStyles}
    >
      {t(enabled ? "enabledBadge" : "disabledBadge")}
    </Badge>
  );
}
