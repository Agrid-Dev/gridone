import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorBoundary } from "react-error-boundary";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { useNotificationsPage } from "@/hooks/useNotificationsPage";
import { NotificationsFilterBar } from "./NotificationsFilterBar";
import { NotificationsTable } from "./NotificationsTable";

function NotificationsLayout({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("notifications");
  return (
    <ErrorBoundary
      fallback={<ErrorFallback title={t("notifications.unableToLoad")} />}
    >
      <section className="space-y-6">
        <ResourceHeader
          title={t("notifications.title")}
          resourceName={t("notifications.subtitle")}
          actions={actions}
        />
        {children}
      </section>
    </ErrorBoundary>
  );
}

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

  const bulkAction =
    selected.size > 0 ? (
      <Button size="sm" variant="outline" onClick={handleBulkDismiss}>
        {t("notifications.markSelectedAsRead", { count: selected.size })}
      </Button>
    ) : null;

  const filterBar = (
    <NotificationsFilterBar
      severityParam={severityParam}
      statusParam={statusParam}
      onSeverityChange={setSeverity}
      onStatusChange={setStatus}
    />
  );

  if (loading) {
    return (
      <NotificationsLayout>
        <Skeleton className="h-64 w-full rounded-lg" />
      </NotificationsLayout>
    );
  }

  if (error) {
    return (
      <NotificationsLayout>
        <ErrorFallback title={t("notifications.unableToLoad")} />
      </NotificationsLayout>
    );
  }

  if (!data || data.total === 0) {
    const isUnreadFilter = statusParam === "unread";
    return (
      <NotificationsLayout actions={bulkAction}>
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
      </NotificationsLayout>
    );
  }

  return (
    <NotificationsLayout actions={bulkAction}>
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
    </NotificationsLayout>
  );
}
