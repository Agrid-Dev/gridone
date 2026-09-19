import type { FC } from "react";
import { Route, Routes } from "react-router";
import { SynopticCreate, SynopticEdit } from "./editor/SynopticEditor";
import SynopticDetail from "./SynopticDetail";
import SynopticsIndex from "./SynopticsIndex";

// The index, one plate, and the editor: one route per action.
const Synoptics: FC = () => (
  <Routes>
    <Route index element={<SynopticsIndex />} />
    <Route path="new" element={<SynopticCreate />} />
    <Route path=":synopticId" element={<SynopticDetail />} />
    <Route path=":synopticId/edit" element={<SynopticEdit />} />
  </Routes>
);

export default Synoptics;
