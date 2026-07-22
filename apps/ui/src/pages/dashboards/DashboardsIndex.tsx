import type { FC } from "react";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { useDashboards } from "./useDashboards";

/** `/dashboards` landing: redirect to the first dashboard, or show an empty
 *  state offering creation when there are none. */
const DashboardsIndexContent: FC = () => {
  const { t } = useTranslation("dashboards");
  const dashboards = useDashboards();

  if (dashboards.length === 0) {
    return <ResourceEmpty resourceName={t("resourceName")} />;
  }

  return <Navigate to={dashboards[0].id} replace />;
};

const DashboardsIndex: FC = () => (
  <ResourceBoundary resetKeys={[]}>
    <DashboardsIndexContent />
  </ResourceBoundary>
);

export default DashboardsIndex;
