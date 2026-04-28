import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { useNotificationsPage } from "@/hooks/useNotificationsPage";
import { NotificationsFilterBar } from "./NotificationsFilterBar";
import { NotificationsTable } from "./NotificationsTable";

export default function NotificationsPage() {
  const { t } = useTranslation("notifications");
  const { t: tc } = useTranslation();

  const {
    data,
    loading,
    error,
    severityParam,
    statusParam,
    selected,
    allSelected,
    prevHref,
    nextHref,
    setSeverity,
    setStatus,
    toggleSelect,
    toggleSelectAll,
    handleBulkDismiss,
    handleSingleDismiss,
    clearFilters,
  } = useNotificationsPage();

  const filterBar = (
    <NotificationsFilterBar
      severityParam={severityParam}
      statusParam={statusParam}
      onSeverityChange={setSeverity}
      onStatusChange={setStatus}
    />
  );

  const bulkAction =
    selected.size > 0 ? (
      <Button size="sm" variant="outline" onClick={handleBulkDismiss}>
        {t("notifications.markSelectedAsRead", { count: selected.size })}
      </Button>
    ) : null;

  const header = (
    <ResourceHeader
      title={t("notifications.title")}
      resourceName={t("notifications.subtitle")}
      actions={bulkAction}
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

  if (!data || data.total === 0) {
    const isUnreadFilter = statusParam === "unread";
    return (
      <section className="space-y-6">
        {header}
        {filterBar}
        <ResourceEmpty
          resourceName={tc("common.notification")}
          filtered={!!(severityParam || statusParam)}
          showCreate={false}
          onClearFilters={clearFilters}
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

  return (
    <section className="space-y-6">
      {header}
      {filterBar}
      <NotificationsTable
        data={data}
        selected={selected}
        allSelected={allSelected}
        onToggle={toggleSelect}
        onToggleAll={toggleSelectAll}
        onDismiss={handleSingleDismiss}
        prevHref={prevHref}
        nextHref={nextHref}
      />
    </section>
  );
}
