import { Routes, Route } from "react-router";
import DriversList from "./DriversList";
import DriverDetails from "./DriverDetails";

import { FC } from "react";

const Drivers: FC = () => (
  <Routes>
    <Route index element={<DriversList />} />
    <Route path=":driverId" element={<DriverDetails />} />
  </Routes>
);

export default Drivers;
