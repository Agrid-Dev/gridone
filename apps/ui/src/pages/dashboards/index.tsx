import type { FC } from "react";
import { Route, Routes } from "react-router";
import DashboardCreate from "./DashboardCreate";
import DashboardDetail from "./DashboardDetail";
import DashboardsIndex from "./DashboardsIndex";
import DashboardsManage from "./DashboardsManage";
import WidgetCreate from "./widgets/WidgetCreate";
import WidgetEdit from "./widgets/WidgetEdit";

// `index` lands on the first dashboard (or an empty state); `new` is the create
// form; `manage` is the Configuration page over the list (declared before
// `:dashboardId` so the literal isn't read as an id); `:dashboardId` is the
// detail view. Authoring a widget is a page of its own (form + live preview),
// one route per action.
const Dashboards: FC = () => (
  <Routes>
    <Route index element={<DashboardsIndex />} />
    <Route path="new" element={<DashboardCreate />} />
    <Route path="manage" element={<DashboardsManage />} />
    <Route path=":dashboardId" element={<DashboardDetail />} />
    <Route path=":dashboardId/widgets/new" element={<WidgetCreate />} />
    <Route
      path=":dashboardId/widgets/:widgetId/edit"
      element={<WidgetEdit />}
    />
  </Routes>
);

export default Dashboards;
