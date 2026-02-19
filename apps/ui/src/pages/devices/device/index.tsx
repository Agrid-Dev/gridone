import { Routes, Route } from "react-router";
import { FC } from "react";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import DeviceHistory from "./DeviceHistory";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";

const Device: FC = () => (
  <Routes>
    <Route path="new" element={<DeviceCreate />} />
    <Route path=":deviceId" element={<DeviceLayout />}>
      <Route index element={<DeviceLiveControl />} />
      <Route path="history" element={<DeviceHistory />} />
    </Route>
    <Route path=":deviceId/edit" element={<DeviceEdit />} />
  </Routes>
);

export default Device;
