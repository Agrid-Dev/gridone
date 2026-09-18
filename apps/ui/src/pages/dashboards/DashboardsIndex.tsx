import { usePermissions } from "@/contexts/AuthContext";
import type { FC } from "react";
import { Navigate, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { useDashboards } from "./useDashboards";

/** `/dashboards` landing: redirect to the first dashboard, or show an empty
 *  state offering creation when there are none. */
const DashboardsIndexContent: FC = () => {
  const { t } = useTranslation(["dashboards", "common"]);
  const dashboards = useDashboards();
  const can = usePermissions();
  const { search } = useLocation();

  if (dashboards.length === 0) {
    return (
      <ResourceEmpty
        resourceName={t("resourceName")}
        showCreate={can("dashboards:write")}
        createTo="/dashboards/new"
        createLabel={t("common:empty.create.dashboards")}
      />
    );
  }

  return <Navigate to={{ pathname: dashboards[0].id, search }} replace />;
};

const DashboardsIndex: FC = () => (
  <ResourceBoundary resetKeys={[]}>
    <DashboardsIndexContent />
  </ResourceBoundary>
);

export default DashboardsIndex;
