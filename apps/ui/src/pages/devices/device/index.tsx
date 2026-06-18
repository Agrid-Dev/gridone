import { Routes, Route, Navigate } from "react-router";
import { FC, Suspense, lazy } from "react";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import DeviceHistoryLayout from "./device-history/DeviceHistoryLayout";
import DeviceHistoryTable from "./device-history/DeviceHistoryTable";
import DeviceHistoryChart from "./device-history/DeviceHistoryChart";
import DeviceCreate from "./DeviceCreate";
import DeviceConfigPage from "./config/DeviceConfigPage";
import DeviceCommandsPage from "./DeviceCommandsPage";

const NewCommandPage = lazy(() => import("../commands/new/NewCommandPage"));

const Device: FC = () => (
  <Routes>
    <Route path="new" element={<DeviceCreate />} />
    <Route path=":deviceId" element={<DeviceLayout />}>
      <Route index element={<DeviceLiveControl />} />
      <Route path="history" element={<DeviceHistoryLayout />}>
        <Route index element={<Navigate to="chart" replace />} />
        <Route path="table" element={<DeviceHistoryTable />} />
        <Route path="chart" element={<DeviceHistoryChart />} />
      </Route>
      <Route path="commands" element={<DeviceCommandsPage />} />
      <Route
        path="commands/new"
        element={
          <Suspense>
            <NewCommandPage />
          </Suspense>
        }
      />
      <Route path="config" element={<DeviceConfigPage />} />
      {/* Legacy /devices/:id/edit → /config */}
      <Route path="edit" element={<Navigate to="../config" replace />} />
    </Route>
  </Routes>
);

export default Device;
