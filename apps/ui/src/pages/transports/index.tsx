import { FC } from "react";
import { Route, Routes } from "react-router";
import TransportsList from "./TransportsList";
import TransportDetails from "./TransportDetails";
import TransportCreate from "./TransportCreate";
import TransportEdit from "./TransportEdit";

/** Transports (displayed as "Networks") mirror Drivers: readable by any role,
 *  with create/edit/delete gated on `transports:write`. */
const Transports: FC = () => {
  return (
    <Routes>
      <Route index element={<TransportsList />} />
      <Route path="new" element={<TransportCreate />} />
      <Route path=":transportId" element={<TransportDetails />} />
      <Route path=":transportId/edit" element={<TransportEdit />} />
    </Routes>
  );
};

export default Transports;
