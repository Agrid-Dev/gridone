import { useState } from "react";
import type { FC } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Settings2, X } from "lucide-react";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button } from "@/components/ui/button";
import { DashboardGrid } from "./DashboardGrid";
import { DashboardTabs } from "./DashboardTabs";
import { DashboardToolbox } from "./DashboardToolbox";
import { useDashboardFromRoute, useDashboards } from "./useDashboards";
import { useLayoutEditor } from "./useLayoutEditor";

const DashboardDetailContent: FC = () => {
  const { t } = useTranslation("dashboards");
  const summaries = useDashboards();
  const dashboard = useDashboardFromRoute();
  const { editing, layout, dirty, enter, save, cancel, onLayoutChange } =
    useLayoutEditor(dashboard);
  const [toolboxOpen, setToolboxOpen] = useState(false);

  useBreadcrumb([{ to: `/dashboards/${dashboard.id}`, label: dashboard.name }]);

  const hasWidgets = (dashboard.widgets ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Constant section title (the active dashboard's name is its tab, not a
          second header) with the switcher row below it. */}
      <ResourceHeader title={t("title")} />
      <div className="flex flex-col gap-2">
        {/* Navigation row: tabs on the left; a toolbox toggle on the right (or
            the layout Save/Cancel controls while editing). Edition actions live
            in the opt-in toolbox row below, kept out of navigation. */}
        <div className="flex items-center gap-2">
          <DashboardTabs
            summaries={summaries}
            activeId={dashboard.id}
            disabled={editing}
          />
          {/* The toggle is hidden while editing — the toolbox row is locked to
              the layout Save/Cancel controls until you exit. */}
          {!editing && (
            <Button
              variant={toolboxOpen ? "secondary" : "ghost"}
              size="icon"
              className="ml-auto"
              aria-pressed={toolboxOpen}
              aria-label={toolboxOpen ? t("toolbox.hide") : t("toolbox.show")}
              onClick={() => setToolboxOpen((open) => !open)}
            >
              {toolboxOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Settings2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
        {editing ? (
          // Same toolbox container, content switched to the layout edit form.
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
            <span className="text-sm text-muted-foreground">
              {dirty ? t("layout.unsaved") : t("layout.editing")}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={cancel}
            >
              {t("layout.cancel")}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty}>
              {t("layout.save")}
            </Button>
          </div>
        ) : (
          toolboxOpen && (
            <DashboardToolbox
              dashboard={dashboard}
              summaries={summaries}
              hasWidgets={hasWidgets}
              onEditLayout={enter}
            />
          )
        )}
        {dashboard.description && (
          <p className="pl-4 text-sm text-muted-foreground">
            {dashboard.description}
          </p>
        )}
      </div>

      {hasWidgets ? (
        <DashboardGrid
          dashboard={dashboard}
          layout={layout}
          editing={editing}
          onLayoutChange={onLayoutChange}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("widgets.empty")}
        </div>
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
