import { Routes, Route } from "react-router";
import { FC } from "react";
import TransportsList from "./TransportsList";
import TransportDetails from "./TransportDetails";
import TransportCreate from "./TransportCreate";
import TransportEdit from "./TransportEdit";

const Transports: FC = () => (
  <Routes>
    <Route index element={<TransportsList />} />
    <Route path=":transport_id" element={<TransportDetails />} />
    <Route path="new" element={<TransportCreate />} />
    <Route path=":transport_id/edit" element={<TransportEdit />} />
  </Routes>
);

export default Transports;
