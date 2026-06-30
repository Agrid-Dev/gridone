import { Routes, Route } from "react-router";
import DriversList from "./DriversList";
import DriverDetails from "./DriverDetails";
import DriverCreate from "./DriverCreate";
import DriverEdit from "./DriverEdit";

import { FC } from "react";

const Drivers: FC = () => (
  <Routes>
    <Route index element={<DriversList />} />
    <Route path=":driverId" element={<DriverDetails />} />
    <Route path=":driverId/edit" element={<DriverEdit />} />
    <Route path="new" element={<DriverCreate />} />
  </Routes>
);

export default Drivers;
