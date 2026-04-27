import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { SeverityChip } from "@/components/SeverityChip";
import { formatTimeAgo } from "@/lib/utils";
import type { NotificationDispatch } from "@/api/notifications";
import { cn } from "@/lib/utils";

type NotificationRowProps = {
  dispatch: NotificationDispatch;
  selected: boolean;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;
};

export function NotificationRow({
  dispatch,
  selected,
  onToggle,
  onDismiss,
}: NotificationRowProps) {
  const { t } = useTranslation("notifications");
  const { t: tc } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isDismissed = dispatch.dismissedAt !== null;
  const notifId = dispatch.notification.id;

  const receivedAgo = formatTimeAgo(
    new Date(dispatch.dispatchedAt).getTime(),
    tc as (key: string, options?: unknown) => string,
  );

  return (
    <TableRow className={cn(isDismissed && "opacity-50")}>
      <TableCell className="w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(notifId)}
          disabled={isDismissed}
          className="h-4 w-4 cursor-pointer accent-primary"
          aria-label={dispatch.notification.title}
        />
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <p className="font-medium leading-none">
            {dispatch.notification.title}
          </p>
          <p
            className={cn(
              "text-sm text-muted-foreground",
              !expanded && "line-clamp-2",
            )}
          >
            {dispatch.notification.body}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {expanded
              ? t("notifications.showLess")
              : t("notifications.showMore")}
          </button>
        </div>
      </TableCell>
      <TableCell>
        <SeverityChip severity={dispatch.notification.severity} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {receivedAgo}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {isDismissed && dispatch.dismissedAt
          ? formatTimeAgo(
              new Date(dispatch.dismissedAt).getTime(),
              tc as (key: string, options?: unknown) => string,
            )
          : "—"}
      </TableCell>
      <TableCell className="w-24 text-right">
        <Button
          variant="ghost"
          size="sm"
          disabled={isDismissed}
          onClick={() => onDismiss(notifId)}
        >
          {t("notifications.dismiss")}
        </Button>
      </TableCell>
    </TableRow>
  );
}
