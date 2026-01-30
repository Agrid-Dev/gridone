import { Routes, Route } from "react-router";
import DevicesList from "./DevicesList";
import DeviceDetails from "./DeviceDetails";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";

import { FC } from "react";

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    <Route path="new" element={<DeviceCreate />} />
    <Route path=":deviceId" element={<DeviceDetails />} />
    <Route path=":deviceId/edit" element={<DeviceEdit />} />
  </Routes>
);

export default Devices;
