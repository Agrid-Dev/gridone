import { FC } from "react";
import { Route, Routes, useLocation } from "react-router";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import DriversList from "./DriversList";
import DriverDetails from "./DriverDetails";
import DriverCreate from "./DriverCreate";
import DriverEdit from "./DriverEdit";

const Drivers: FC = () => {
  const { pathname } = useLocation();
  return (
    <RequirePermission permission="drivers:read">
      <ResourceBoundary resetKeys={[pathname]}>
        <Routes>
          <Route index element={<DriversList />} />
          <Route path=":driverId" element={<DriverDetails />} />
          <Route
            path="new"
            element={
              <RequirePermission permission="drivers:write">
                <DriverCreate />
              </RequirePermission>
            }
          />
          <Route
            path=":driverId/edit"
            element={
              <RequirePermission permission="drivers:write">
                <DriverEdit />
              </RequirePermission>
            }
          />
        </Routes>
      </ResourceBoundary>
    </RequirePermission>
  );
};

export default Drivers;
