import { FC, lazy } from "react";
import { Route, Routes, useLocation } from "react-router";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";

const GroupsListPage = lazy(() => import("./GroupsListPage"));
const ViewFormPage = lazy(() => import("./ViewFormPage"));

/** Configuration › Groups. Consulting a group and commanding it stay in
 *  supervision, under /devices/views. */
const Groups: FC = () => {
  const { pathname } = useLocation();
  return (
    <RequirePermission permission="devices:write">
      <ResourceBoundary resetKeys={[pathname]}>
        <Routes>
          <Route index element={<GroupsListPage />} />
          <Route path="new" element={<ViewFormPage />} />
          <Route path=":viewId/edit" element={<ViewFormPage />} />
        </Routes>
      </ResourceBoundary>
    </RequirePermission>
  );
};

export default Groups;
