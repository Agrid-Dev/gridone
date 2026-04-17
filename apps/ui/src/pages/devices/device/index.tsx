import { Routes, Route, Navigate } from "react-router";
import { FC, Suspense, lazy } from "react";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import DeviceHistoryLayout from "./device-history/DeviceHistoryLayout";
import DeviceHistoryTable from "./device-history/DeviceHistoryTable";
import DeviceHistoryChart from "./device-history/DeviceHistoryChart";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";
import DeviceCommandsPage from "./DeviceCommandsPage";

const NewCommandPage = lazy(() => import("../commands/new/NewCommandPage"));

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
      <Route path="commands" element={<DeviceCommandsPage />} />
    </Route>
    <Route
      path=":deviceId/commands/new"
      element={
        <Suspense>
          <NewCommandPage context="device" />
        </Suspense>
      }
    />
    <Route path=":deviceId/edit" element={<DeviceEdit />} />
  </Routes>
);

export default Device;
