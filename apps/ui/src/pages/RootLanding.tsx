import type { FC } from "react";
import { Navigate } from "react-router";
import Home from "./home";
import { useDashboardEntries } from "./dashboards/useDashboards";
import { useFeatureEnabled } from "@/utils/featureFlags";

/** The root lands on the first dashboard, the building's main view; the home
 *  page is the fallback for a deployment without one. Nothing is drawn until
 *  the list is known, so the home page never flashes before a redirect. */
const RootLanding: FC = () => {
  const dashboardsEnabled = useFeatureEnabled("dashboards");
  const { dashboards, ready } = useDashboardEntries();
  if (!dashboardsEnabled) return <Home />;
  if (!ready) return null;
  const first = dashboards[0];
  if (!first) return <Home />;
  return (
    <Navigate to={`/dashboards/${encodeURIComponent(first.id)}`} replace />
  );
};

export default RootLanding;
