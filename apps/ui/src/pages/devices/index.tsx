import { Routes, Route } from "react-router";
import { lazy, FC, Suspense } from "react";
import DevicesList from "./DevicesList";
import Device from "./device";

const CommandsPage = lazy(() => import("./commands/CommandsPage"));
const NewCommandPage = lazy(() => import("./commands/new/NewCommandPage"));

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    <Route
      path="history"
      element={
        <Suspense>
          <CommandsPage />
        </Suspense>
      }
    />
    <Route
      path="commands/new"
      element={
        <Suspense>
          <NewCommandPage context="open" />
        </Suspense>
      }
    />
    <Route path="*" element={<Device />} />
  </Routes>
);

export default Devices;
