import { Routes, Route, useLocation } from "react-router";
import { FC, Suspense, lazy } from "react";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import AssetsList from "./AssetsList";
import AssetCreate from "./AssetCreate";
import AssetDetail from "./AssetDetail";
import AssetEdit from "./AssetEdit";

const NewCommandPage = lazy(
  () => import("../devices/commands/new/NewCommandPage"),
);

const Assets: FC = () => {
  const { pathname } = useLocation();
  return (
    <RequirePermission permission="assets:read">
      <ResourceBoundary resetKeys={[pathname]}>
        <Routes>
          <Route index element={<AssetsList />} />
          <Route
            path="new"
            element={
              <RequirePermission permission="assets:write">
                <AssetCreate />
              </RequirePermission>
            }
          />
          <Route
            path=":assetId/edit"
            element={
              <RequirePermission permission="assets:write">
                <AssetEdit />
              </RequirePermission>
            }
          />
          <Route
            path=":assetId/commands/new"
            element={
              <RequirePermission permission="devices:write">
                <Suspense>
                  <NewCommandPage />
                </Suspense>
              </RequirePermission>
            }
          />
          <Route path=":assetId" element={<AssetDetail />} />
        </Routes>
      </ResourceBoundary>
    </RequirePermission>
  );
};

export default Assets;
