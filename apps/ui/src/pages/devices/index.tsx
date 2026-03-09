import { Routes, Route } from "react-router";
import { lazy, FC, Suspense } from "react";
import DevicesList from "./DevicesList";
import Device from "./device";

const CommandsPage = lazy(() => import("./commands/CommandsPage"));

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    <Route
      path="commands"
      element={
        <Suspense>
          <CommandsPage />
        </Suspense>
      }
    />
    <Route path="*" element={<Device />} />
  </Routes>
);

export default Devices;
