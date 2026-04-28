import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { SeverityChip } from "@/components/SeverityChip";
import { cn, formatTimeAgo } from "@/lib/utils";
import type { NotificationDispatch } from "@/api/notifications";

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
  const [isTruncated, setIsTruncated] = useState(true);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const isDismissed = dispatch.dismissedAt !== null;
  const notifId = dispatch.notification.id;

  useEffect(() => {
    const el = bodyRef.current;
    if (el) {
      // In jsdom scrollHeight is 0; treat that as truncated to keep toggle visible
      setIsTruncated(
        el.scrollHeight === 0 || el.scrollHeight > el.clientHeight,
      );
    }
  }, []);

  const tc_ = tc as (key: string, options?: unknown) => string;
  const receivedAgo = formatTimeAgo(
    new Date(dispatch.dispatchedAt).getTime(),
    tc_,
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
            ref={bodyRef}
            className={cn(
              "text-sm text-muted-foreground",
              !expanded && "line-clamp-2",
            )}
          >
            {dispatch.notification.body}
          </p>
          {isTruncated && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {expanded
                ? t("notifications.showLess")
                : t("notifications.showMore")}
            </button>
          )}
        </div>
      </TableCell>
      <TableCell>
        <SeverityChip severity={dispatch.notification.severity} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {receivedAgo}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
        {isDismissed && dispatch.dismissedAt
          ? formatTimeAgo(new Date(dispatch.dismissedAt).getTime(), tc_)
          : "—"}
      </TableCell>
      <TableCell className="w-24 text-right">
        {!isDismissed && (
          <Button variant="ghost" size="sm" onClick={() => onDismiss(notifId)}>
            {t("notifications.markAsRead")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
