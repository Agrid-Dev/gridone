import { useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { NotificationRow } from "./NotificationRow";
import { useNotifications } from "@/hooks/useNotifications";
import { toSearchString } from "@/api/pagination";
import type { Severity } from "@/api/notifications";

type DismissedFilter = "all" | "unread" | "dismissed";

function parseDismissed(value: string | null): boolean | undefined {
  if (value === "unread") return false;
  if (value === "dismissed") return true;
  return undefined;
}

export default function NotificationsPage() {
  const { t } = useTranslation("notifications");
  const { t: tc } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const severityParam = searchParams.get("severity") as Severity | null;
  const dismissedParam = searchParams.get(
    "dismissed",
  ) as DismissedFilter | null;

  const filter = {
    page,
    severity: severityParam ?? undefined,
    dismissed: parseDismissed(dismissedParam),
  };

  const {
    page: data,
    loading,
    error,
    dismiss,
    dismissMany,
  } = useNotifications(filter);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const undismissed =
      data?.items
        .filter((d) => d.dismissedAt === null)
        .map((d) => d.notification.id) ?? [];
    const allSelected = undismissed.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(undismissed));
    }
  }

  async function handleBulkDismiss() {
    const ids = Array.from(selected);
    await dismissMany(ids);
    setSelected(new Set());
  }

  function handleSingleDismiss(id: string) {
    dismiss(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const undismissedOnPage =
    data?.items
      .filter((d) => d.dismissedAt === null)
      .map((d) => d.notification.id) ?? [];
  const allSelected =
    undismissedOnPage.length > 0 &&
    undismissedOnPage.every((id) => selected.has(id));

  const bulkDismissButton =
    selected.size > 0 ? (
      <Button size="sm" variant="outline" onClick={handleBulkDismiss}>
        {t("notifications.dismissSelected", { count: selected.size })}
      </Button>
    ) : null;

  const header = (
    <ResourceHeader
      title={t("notifications.title")}
      resourceName={t("notifications.subtitle")}
      actions={bulkDismissButton}
    />
  );

  if (loading) {
    return (
      <section className="space-y-6">
        {header}
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-6">
        {header}
        <ErrorFallback title={t("notifications.unableToLoad")} />
      </section>
    );
  }

  const filterRow = (
    <div className="flex items-center gap-2">
      <Select
        value={severityParam ?? "all"}
        onValueChange={(val) => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (val === "all") next.delete("severity");
            else next.set("severity", val);
            next.delete("page");
            return next;
          });
          setSelected(new Set());
        }}
      >
        <SelectTrigger
          className="w-36"
          aria-label={t("notifications.columns.severity")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("notifications.filter.all")}</SelectItem>
          <SelectItem value="info">Info</SelectItem>
          <SelectItem value="warning">Warning</SelectItem>
          <SelectItem value="alert">Alert</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={dismissedParam ?? "all"}
        onValueChange={(val) => {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (val === "all") next.delete("dismissed");
            else next.set("dismissed", val as DismissedFilter);
            next.delete("page");
            return next;
          });
          setSelected(new Set());
        }}
      >
        <SelectTrigger className="w-36" aria-label="Status filter">
          <SelectValue />
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

  if (!data || data.total === 0) {
    const isUnreadFilter = dismissedParam === "unread";
    return (
      <section className="space-y-6">
        {header}
        {filterRow}
        <ResourceEmpty
          resourceName={t("notifications.title").toLowerCase()}
          filtered={!!(severityParam || dismissedParam)}
          showCreate={false}
          onClearFilters={() => {
            setSearchParams({});
            setSelected(new Set());
          }}
          title={
            isUnreadFilter
              ? t("notifications.emptyUnreadTitle")
              : t("notifications.emptyTitle")
          }
          description={
            isUnreadFilter
              ? t("notifications.emptyUnreadDescription")
              : t("notifications.emptyDescription")
          }
        />
      </section>
    );
  }

  const prevSearch = toSearchString(data.links.prev);
  const nextSearch = toSearchString(data.links.next);

  return (
    <section className="space-y-6">
      {header}
      {filterRow}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 cursor-pointer accent-primary"
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>{t("notifications.columns.title")}</TableHead>
              <TableHead>{t("notifications.columns.severity")}</TableHead>
              <TableHead>{t("notifications.columns.dispatchedAt")}</TableHead>
              <TableHead>{t("notifications.columns.dismissedAt")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((dispatch) => (
              <NotificationRow
                key={dispatch.notification.id}
                dispatch={dispatch}
                selected={selected.has(dispatch.notification.id)}
                onToggle={toggleSelect}
                onDismiss={handleSingleDismiss}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={!prevSearch}
            onClick={() => prevSearch && setSearchParams(prevSearch)}
          >
            {tc("common.previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {data.page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!nextSearch}
            onClick={() => nextSearch && setSearchParams(nextSearch)}
          >
            {tc("common.next")}
          </Button>
        </div>
      )}
    </section>
  );
}
