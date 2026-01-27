import { Routes, Route } from "react-router";
import DevicesList from "./DevicesList";
import DeviceDetails from "./DeviceDetails";

import { FC } from "react";

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    <Route path=":deviceId" element={<DeviceDetails />} />
  </Routes>
);

export default Devices;
