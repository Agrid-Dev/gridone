import { Routes, Route } from "react-router";
import { FC, Suspense, lazy } from "react";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import DeviceHistoryPage from "./device-history/DeviceHistoryPage";
import { RedirectToHistory } from "./device-history/RedirectToHistory";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";
import DeviceConfigView from "./DeviceConfigView";
import DeviceConfigLayout from "./DeviceConfigLayout";
import DeviceCommandsPage from "./DeviceCommandsPage";

const NewCommandPage = lazy(() => import("../commands/new/NewCommandPage"));
const DeviceProtections = lazy(() => import("./protections"));

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
      <Route path="config" element={<DeviceConfigLayout />}>
        <Route index element={<DeviceConfigView />} />
        <Route path="edit" element={<DeviceEdit />} />
        <Route
          path="protections/*"
          element={
            <Suspense>
              <DeviceProtections />
            </Suspense>
          }
        />
      </Route>
    </Route>
  </Routes>
);

export default Device;
