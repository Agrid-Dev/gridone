import type { FC } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DashboardActions } from "./DashboardActions";
import { DashboardGrid } from "./DashboardGrid";
import { DashboardTabs } from "./DashboardTabs";
import { AddWidgetButton } from "./widgets/AddWidgetButton";
import { useDashboardFromRoute, useDashboards } from "./useDashboards";

const DashboardDetailContent: FC = () => {
  const { t } = useTranslation("dashboards");
  const summaries = useDashboards();
  const dashboard = useDashboardFromRoute();

  useBreadcrumb([{ to: `/dashboards/${dashboard.id}`, label: dashboard.name }]);

  return (
    <div className="flex flex-col gap-6">
      {/* Constant section title (the active dashboard's name is its tab, not a
          second header) with the switcher row below it. */}
      <ResourceHeader title={t("title")} />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <DashboardTabs summaries={summaries} activeId={dashboard.id} />
          <div className="ml-auto">
            <DashboardActions dashboard={dashboard} summaries={summaries} />
          </div>
        </div>
        {dashboard.description && (
          <p className="pl-4 text-sm text-muted-foreground">
            {dashboard.description}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <AddWidgetButton dashboardId={dashboard.id} />
      </div>
      {(dashboard.widgets ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("widgets.empty")}
        </div>
      ) : (
        <DashboardGrid dashboard={dashboard} />
      )}
    </div>
  );
};

/** Wrapper: reads the route param and wraps the suspense content in the shared
 *  resource boundary (reset on id change so a stale error doesn't stick). */
const DashboardDetail: FC = () => {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  return (
    <ResourceBoundary resetKeys={[dashboardId]}>
      <DashboardDetailContent />
    </ResourceBoundary>
  );
};

export default DashboardDetail;
