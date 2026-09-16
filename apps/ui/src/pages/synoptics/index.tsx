import type { FC } from "react";
import { Route, Routes } from "react-router";
import SynopticDetail from "./SynopticDetail";
import SynopticsIndex from "./SynopticsIndex";

// Read only: the index and one plate. Authoring comes with the editor.
const Synoptics: FC = () => (
  <Routes>
    <Route index element={<SynopticsIndex />} />
    <Route path=":synopticId" element={<SynopticDetail />} />
  </Routes>
);

export default Synoptics;
