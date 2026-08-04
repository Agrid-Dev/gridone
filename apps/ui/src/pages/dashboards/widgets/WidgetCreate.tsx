import type { FC } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import type { WidgetCreateBody } from "@gridone/sdk";
import { useDashboardFromRoute } from "../useDashboards";
import { useAddWidget, useWidgetSchemas } from "../useWidgets";
import { WidgetEditor } from "./WidgetEditor";

const WidgetCreateContent: FC = () => {
  const { t } = useTranslation("dashboards");
  const navigate = useNavigate();
  const dashboard = useDashboardFromRoute();
  const schemas = useWidgetSchemas();
  const { addWidget } = useAddWidget(dashboard.id);

  return (
    <WidgetEditor
      dashboardId={dashboard.id}
      dashboardName={dashboard.name}
      title={t("widgets.addTitle")}
      submitLabel={t("widgets.addSubmit")}
      schemas={schemas}
      onSubmit={async (values) => {
        try {
          await addWidget({
            config: values.config as WidgetCreateBody["config"],
            title: values.title || undefined,
          });
          navigate(`/dashboards/${dashboard.id}`);
        } catch {
          /* handled by the mutation's onError */
        }
      }}
    />
  );
};

/** `/dashboards/:dashboardId/widgets/new`: author a widget with a live
 *  preview, then land back on the dashboard. */
const WidgetCreate: FC = () => {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  return (
    <ResourceBoundary resetKeys={[dashboardId]}>
      <WidgetCreateContent />
    </ResourceBoundary>
  );
};

export default WidgetCreate;
