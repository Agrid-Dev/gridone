import { Routes, Route } from "react-router";
import { FC, Suspense, lazy } from "react";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import DeviceHistoryPage from "./device-history/DeviceHistoryPage";
import { RedirectToHistory } from "./device-history/RedirectToHistory";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";
import DeviceConfigView from "./DeviceConfigView";
import DeviceCommandsPage from "./DeviceCommandsPage";

const NewCommandPage = lazy(() => import("../commands/new/NewCommandPage"));

const Device: FC = () => (
  <Routes>
    <Route path="new" element={<DeviceCreate />} />
    <Route path=":deviceId" element={<DeviceLayout />}>
      <Route index element={<DeviceLiveControl />} />
      <Route path="history" element={<DeviceHistoryPage />} />
      <Route path="history/chart" element={<RedirectToHistory />} />
      <Route path="history/table" element={<RedirectToHistory />} />
      <Route path="commands" element={<DeviceCommandsPage />} />
      <Route
        path="commands/new"
        element={
          <Suspense>
            <NewCommandPage />
          </Suspense>
        }
      />
      <Route path="config" element={<DeviceConfigView />} />
      <Route path="config/edit" element={<DeviceEdit />} />
    </Route>
  </Routes>
);

export default Device;
