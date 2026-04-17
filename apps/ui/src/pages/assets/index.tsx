import { Routes, Route } from "react-router";
import { FC, Suspense, lazy } from "react";
import AssetsList from "./AssetsList";
import AssetCreate from "./AssetCreate";
import AssetDetail from "./AssetDetail";
import AssetEdit from "./AssetEdit";

const NewCommandPage = lazy(
  () => import("../devices/commands/new/NewCommandPage"),
);

const Assets: FC = () => (
  <Routes>
    <Route index element={<AssetsList />} />
    <Route path="new" element={<AssetCreate />} />
    <Route path=":assetId/edit" element={<AssetEdit />} />
    <Route
      path=":assetId/commands/new"
      element={
        <Suspense>
          <NewCommandPage context="asset" />
        </Suspense>
      }
    />
    <Route path=":assetId" element={<AssetDetail />} />
  </Routes>
);

export default Assets;
