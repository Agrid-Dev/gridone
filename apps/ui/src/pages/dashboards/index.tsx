import type { FC } from "react";
import { Route, Routes } from "react-router";
import DashboardCreate from "./DashboardCreate";
import DashboardDetail from "./DashboardDetail";
import DashboardsIndex from "./DashboardsIndex";

// `index` lands on the first dashboard (or an empty state); `new` is the create
// form; `:dashboardId` is the tab-based detail view.
const Dashboards: FC = () => (
  <Routes>
    <Route index element={<DashboardsIndex />} />
    <Route path="new" element={<DashboardCreate />} />
    <Route path=":dashboardId" element={<DashboardDetail />} />
  </Routes>
);

export default Dashboards;
