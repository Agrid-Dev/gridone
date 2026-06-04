import { type FC } from "react";
import { useTranslation } from "react-i18next";
import type { Action } from "@/api/automations";
import { useUsers } from "@/hooks/useUsers";
import { SeverityChip, type Severity } from "@/components/SeverityChip";
import { SEVERITIES } from "@/api/severity";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asSeverity(value: unknown): Severity {
  return SEVERITIES.includes(value as Severity) ? (value as Severity) : "info";
}

function asUserIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

/** View mode for the ``notification`` action: shows the dispatched
 *  notification's title, body, severity and resolved recipient names. */
export const NotificationPresenter: FC<{ action: Action }> = ({ action }) => {
  const { t } = useTranslation("automations");
  const { usersMap } = useUsers();

  const title = asString(action.params.title);
  const body = asString(action.params.body);
  const severity = asSeverity(action.params.severity);
  const userIds = asUserIds(action.params.userIds);

  const recipients = userIds
    .map((id) => usersMap.get(id)?.name || usersMap.get(id)?.username || id)
    .join(", ");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-foreground">{title}</span>
        <SeverityChip severity={severity} />
      </div>
      {body && (
        <p className="whitespace-pre-wrap text-sm text-foreground/80">{body}</p>
      )}
      <p className="text-sm text-muted-foreground">
        {t("actions.notificationForm.recipients")}: {recipients || "—"}
      </p>
    </div>
  );
};

export default NotificationPresenter;
