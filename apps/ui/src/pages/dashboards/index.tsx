import type { FC } from "react";
import { Route, Routes } from "react-router";
import DashboardDetail from "./DashboardDetail";
import DashboardsIndex from "./DashboardsIndex";
import DashboardsPage from "./DashboardsPage";

// `index` lands on the first dashboard (or an empty state); `:dashboardId` is
// the tab-based detail view. `new` is still a placeholder until step 3 (create).
const Dashboards: FC = () => (
  <Routes>
    <Route index element={<DashboardsIndex />} />
    <Route path="new" element={<DashboardsPage />} />
    <Route path=":dashboardId" element={<DashboardDetail />} />
  </Routes>
);

export default Dashboards;
