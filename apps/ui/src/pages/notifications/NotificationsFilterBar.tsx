import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SEVERITIES } from "@/lib/severity";
import type { Severity } from "@/lib/severity";

type StatusFilter = "all" | "unread" | "dismissed";

type Props = {
  severityParam: Severity | null;
  statusParam: StatusFilter | null;
  onSeverityChange: (val: string) => void;
  onStatusChange: (val: StatusFilter) => void;
};

export function NotificationsFilterBar({
  severityParam,
  statusParam,
  onSeverityChange,
  onStatusChange,
}: Props) {
  const { t } = useTranslation("notifications");
  const { t: tc } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <Select value={severityParam ?? "all"} onValueChange={onSeverityChange}>
        <SelectTrigger
          className="w-36"
          aria-label={t("notifications.filter.severityLabel")}
        >
          <SelectValue>
            {severityParam
              ? tc(`common.severity.${severityParam}`)
              : t("notifications.filter.severityLabel")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("notifications.filter.all")}</SelectItem>
          {SEVERITIES.map((s) => (
            <SelectItem key={s} value={s}>
              {tc(`common.severity.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={statusParam ?? "all"}
        onValueChange={(val) => onStatusChange(val as StatusFilter)}
      >
        <SelectTrigger
          className="w-36"
          aria-label={t("notifications.filter.statusLabel")}
        >
          <SelectValue>
            {statusParam && statusParam !== "all"
              ? t(`notifications.filter.${statusParam}`)
              : t("notifications.filter.statusLabel")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("notifications.filter.all")}</SelectItem>
          <SelectItem value="unread">
            {t("notifications.filter.unread")}
          </SelectItem>
          <SelectItem value="dismissed">
            {t("notifications.filter.dismissed")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
