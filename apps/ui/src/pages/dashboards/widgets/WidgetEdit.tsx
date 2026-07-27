import type { FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { WidgetUpdateBody } from "@gridone/sdk";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { useDashboardFromRoute } from "../useDashboards";
import { useUpdateWidget, useWidgetSchemas } from "../useWidgets";
import { WidgetEditor } from "./WidgetEditor";

const WidgetEditContent: FC = () => {
  const { t } = useTranslation("dashboards");
  const { widgetId } = useParams<{ widgetId: string }>();
  const navigate = useNavigate();
  const dashboard = useDashboardFromRoute();
  const schemas = useWidgetSchemas();
  const { updateWidget } = useUpdateWidget(dashboard.id);

  const widget = (dashboard.widgets ?? []).find((w) => w.id === widgetId);

  useBreadcrumb([
    { to: `/dashboards/${dashboard.id}`, label: dashboard.name },
    {
      to: `/dashboards/${dashboard.id}/widgets/${widgetId}/edit`,
      label: widget?.title || t("widgets.editTitle"),
    },
  ]);

  // The dashboard document carries its widgets, so an unknown id is a dead
  // link rather than a failed request — no 404 comes back to the boundary.
  if (!widget) return <NotFoundFallback />;

  return (
    <WidgetEditor
      dashboardId={dashboard.id}
      dashboardName={dashboard.name}
      title={t("widgets.editTitle")}
      submitLabel={t("widgets.editSubmit")}
      schemas={schemas}
      widget={widget}
      onSubmit={async (values) => {
        try {
          await updateWidget(widget.id, {
            title: values.title,
            config: values.config as WidgetUpdateBody["config"],
          });
          navigate(`/dashboards/${dashboard.id}`);
        } catch {
          /* handled by the mutation's onError */
        }
      }}
    />
  );
};

/** `/dashboards/:dashboardId/widgets/:widgetId/edit`: same editor as create,
 *  seeded with the widget and with its type locked. */
const WidgetEdit: FC = () => {
  const { dashboardId, widgetId } = useParams<{
    dashboardId: string;
    widgetId: string;
  }>();
  return (
    <ResourceBoundary resetKeys={[dashboardId, widgetId]}>
      <WidgetEditContent />
    </ResourceBoundary>
  );
};

export default WidgetEdit;
