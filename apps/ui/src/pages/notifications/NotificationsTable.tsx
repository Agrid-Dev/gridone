import { useTranslation } from "react-i18next";
import { PaginationControls } from "@/components/PaginationControls";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NotificationRow } from "./NotificationRow";
import type { NotificationDispatch, Page } from "@gridone/sdk";

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

      <PaginationControls
        page={data.page}
        totalPages={data.total_pages}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </>
  );
}
