import { Routes, Route } from "react-router";
import { FC } from "react";
import AssetsList from "./AssetsList";
import AssetCreate from "./AssetCreate";
import AssetDetail from "./AssetDetail";
import AssetEdit from "./AssetEdit";

const Assets: FC = () => (
  <Routes>
    <Route index element={<AssetsList />} />
    <Route path="new" element={<AssetCreate />} />
    <Route path=":assetId/edit" element={<AssetEdit />} />
    <Route path=":assetId" element={<AssetDetail />} />
  </Routes>
);

export default Assets;
