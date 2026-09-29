import { Routes, Route } from "react-router";
import { FC, Suspense, lazy } from "react";
import DeviceLayout from "./DeviceLayout";
import DeviceLiveControl from "./DeviceLiveControl";
import { deviceHistoryRoutes } from "./device-history/routes";
import DeviceCreate from "./DeviceCreate";
import DeviceEdit from "./DeviceEdit";
import DeviceConfigView from "./DeviceConfigView";
import DeviceConfigLayout from "./DeviceConfigLayout";
import DeviceCommandsPage from "./DeviceCommandsPage";

const NewCommandPage = lazy(() => import("../commands/new/NewCommandPage"));
const DeviceAutomations = lazy(() => import("./automations/DeviceAutomations"));
const DeviceOperatingRules = lazy(() => import("./operating-rules"));

const Device: FC = () => (
  <Routes>
    <Route path="new" element={<DeviceCreate />} />
    <Route path=":deviceId" element={<DeviceLayout />}>
      <Route index element={<DeviceLiveControl />} />
      {deviceHistoryRoutes}
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
          path="automations"
          element={
            <Suspense>
              <DeviceAutomations />
            </Suspense>
          }
        />
        <Route
          path="operating-rules/*"
          element={
            <Suspense>
              <DeviceOperatingRules />
            </Suspense>
          }
        />
      </Route>
    </Route>
  </Routes>
);

export default Device;
