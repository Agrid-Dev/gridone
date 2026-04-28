import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { NotificationRow } from "./NotificationRow";
import type { NotificationDispatch } from "@/api/notifications";
import type { Page } from "@/api/pagination";

type Props = {
  data: Page<NotificationDispatch>;
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onDismiss: (id: string) => void;
  prevHref: string | undefined;
  nextHref: string | undefined;
};

export function NotificationsTable({
  data,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onDismiss,
  prevHref,
  nextHref,
}: Props) {
  const { t } = useTranslation("notifications");

  const linkClasses = cn(
    buttonVariants({ variant: "outline", size: "icon" }),
    "h-8 w-8",
  );
  const disabledClasses = "pointer-events-none opacity-50";

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 cursor-pointer accent-primary"
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>{t("notifications.columns.title")}</TableHead>
              <TableHead>{t("notifications.columns.severity")}</TableHead>
              <TableHead>{t("notifications.columns.dispatchedAt")}</TableHead>
              <TableHead>{t("notifications.columns.readAt")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((dispatch) => (
              <NotificationRow
                key={dispatch.notification.id}
                dispatch={dispatch}
                selected={selected.has(dispatch.notification.id)}
                onToggle={onToggle}
                onDismiss={onDismiss}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          {prevHref ? (
            <Link to={{ search: prevHref }} className={linkClasses} replace>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(linkClasses, disabledClasses)}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {data.page} / {data.totalPages}
          </span>
          {nextHref ? (
            <Link to={{ search: nextHref }} className={linkClasses} replace>
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className={cn(linkClasses, disabledClasses)}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      )}
    </>
  );
}
