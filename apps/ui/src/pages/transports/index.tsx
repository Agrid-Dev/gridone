import { FC } from "react";
import { Route, Routes, useLocation } from "react-router";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import TransportsList from "./TransportsList";
import TransportDetails from "./TransportDetails";
import TransportCreate from "./TransportCreate";
import TransportEdit from "./TransportEdit";

const Transports: FC = () => {
  const { pathname } = useLocation();
  return (
    <RequirePermission permission="transports:read">
      <ResourceBoundary resetKeys={[pathname]}>
        <Routes>
          <Route index element={<TransportsList />} />
          <Route path=":transportId" element={<TransportDetails />} />
          <Route
            path="new"
            element={
              <RequirePermission permission="transports:write">
                <TransportCreate />
              </RequirePermission>
            }
          />
          <Route
            path=":transportId/edit"
            element={
              <RequirePermission permission="transports:write">
                <TransportEdit />
              </RequirePermission>
            }
          />
        </Routes>
      </ResourceBoundary>
    </RequirePermission>
  );
};

export default Transports;
