import { Routes, Route } from "react-router";
import DevicesList from "./DevicesList";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import DeviceHistory from "./DeviceHistory";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";

import { FC } from "react";

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    <Route path="new" element={<DeviceCreate />} />
    <Route path=":deviceId" element={<DeviceLayout />}>
      <Route index element={<DeviceLiveControl />} />
      <Route path="history" element={<DeviceHistory />} />
    </Route>
    <Route path=":deviceId/edit" element={<DeviceEdit />} />
  </Routes>
);

export default Devices;
