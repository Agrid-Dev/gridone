import type { FC } from "react";
import { Route, Routes } from "react-router";
import DashboardsPage from "./DashboardsPage";

// Step 1 scaffold: every route renders the placeholder. Later steps split
// these into the tab-based detail view (`:dashboardId`), the redirect-to-first
// landing (`index`), and the create form (`new`).
const Dashboards: FC = () => (
  <Routes>
    <Route index element={<DashboardsPage />} />
    <Route path="new" element={<DashboardsPage />} />
    <Route path=":dashboardId" element={<DashboardsPage />} />
  </Routes>
);

export default Dashboards;
