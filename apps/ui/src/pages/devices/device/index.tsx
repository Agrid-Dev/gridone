import { Routes, Route, Navigate } from "react-router";
import { FC } from "react";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import DeviceHistoryLayout from "./device-history/DeviceHistoryLayout";
import DeviceHistoryTable from "./device-history/DeviceHistoryTable";
import DeviceHistoryChart from "./device-history/DeviceHistoryChart";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";

const Device: FC = () => (
  <Routes>
    <Route path="new" element={<DeviceCreate />} />
    <Route path=":deviceId" element={<DeviceLayout />}>
      <Route index element={<DeviceLiveControl />} />
    </Route>
    <Route path=":deviceId/history" element={<DeviceHistoryLayout />}>
      <Route index element={<Navigate to="table" replace />} />
      <Route path="table" element={<DeviceHistoryTable />} />
      <Route path="chart" element={<DeviceHistoryChart />} />
    </Route>
    <Route path=":deviceId/edit" element={<DeviceEdit />} />
  </Routes>
);

export default Device;
