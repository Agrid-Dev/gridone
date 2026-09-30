import { usePermissions } from "@/contexts/AuthContext";
import { AddWidgetButton } from "./widgets/AddWidgetButton";
import { useState } from "react";
import type { FC } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Info, Settings2, X } from "lucide-react";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DASHBOARD_DEFAULT_PRESET,
  DASHBOARD_PRESET_OPTIONS,
} from "@/lib/timeRange";
import { DashboardGrid } from "./DashboardGrid";
import { DashboardToolbox } from "./DashboardToolbox";
import { DASHBOARD_PERIOD_STORAGE_KEY } from "./useDashboardPeriod";
import { useDashboardFromRoute, useDashboards } from "./useDashboards";
import { useLayoutEditor } from "./useLayoutEditor";

const DashboardDetailContent: FC = () => {
  const { t } = useTranslation("dashboards");
  const can = usePermissions();
  const summaries = useDashboards();
  const dashboard = useDashboardFromRoute();
  const { editing, layout, dirty, enter, save, cancel, onLayoutChange } =
    useLayoutEditor(dashboard);
  const [toolboxOpen, setToolboxOpen] = useState(false);

  const hasWidgets = (dashboard.widgets ?? []).length > 0;

  return (
    <div
      className="flex min-w-0 flex-col gap-6"
      data-navigation-title={dashboard.name || dashboard.id}
    >
      <ResourceHeader
        title={dashboard.name}
        actions={
          <>
            <TimeRangeSelect
              presets={DASHBOARD_PRESET_OPTIONS}
              defaultPreset={DASHBOARD_DEFAULT_PRESET}
              storageKey={DASHBOARD_PERIOD_STORAGE_KEY}
            />
            {can("dashboards:write") && (
              <AddWidgetButton dashboardId={dashboard.id} disabled={editing} />
            )}
            {!editing && can("dashboards:write") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={toolboxOpen ? "secondary" : "ghost"}
                    size="icon"
                    aria-expanded={toolboxOpen}
                    aria-controls="dashboard-toolbox"
                    aria-label={
                      toolboxOpen ? t("toolbox.hide") : t("toolbox.show")
                    }
                    onClick={() => setToolboxOpen((open) => !open)}
                  >
                    {toolboxOpen ? (
                      <X aria-hidden className="h-4 w-4" />
                    ) : (
                      <Settings2 aria-hidden className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {toolboxOpen ? t("toolbox.hide") : t("toolbox.show")}
                </TooltipContent>
              </Tooltip>
            )}
          </>
        }
      />
      {(editing || toolboxOpen || dashboard.description) && (
        <div className="flex flex-col gap-2">
          {editing ? (
            // Same toolbox container, content switched to the layout edit form.
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
              <span className="text-sm text-muted-foreground">
                {dirty ? t("layout.unsaved") : t("layout.editing")}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto min-h-11"
                onClick={cancel}
              >
                {t("layout.cancel")}
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={!dirty}>
                {t("layout.save")}
              </Button>
            </div>
          ) : (
            toolboxOpen &&
            can("dashboards:write") && (
              <div id="dashboard-toolbox">
                <DashboardToolbox
                  dashboard={dashboard}
                  summaries={summaries}
                  hasWidgets={hasWidgets}
                  onEditLayout={enter}
                />
              </div>
            )
          )}
          {dashboard.description && (
            <div className="flex items-start gap-2 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
              <p>{dashboard.description}</p>
            </div>
          )}
        </div>
      )}

      {hasWidgets ? (
        <DashboardGrid
          dashboard={dashboard}
          layout={layout}
          editing={editing}
          showWidgetActions={toolboxOpen}
          onLayoutChange={onLayoutChange}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <p>{t("widgets.empty")}</p>
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
