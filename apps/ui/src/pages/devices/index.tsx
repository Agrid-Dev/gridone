import { Routes, Route, Navigate } from "react-router";
import { lazy, FC, Suspense } from "react";
import DevicesList from "./DevicesList";
import Device from "./device";

const CommandsPage = lazy(() => import("./commands/CommandsPage"));
const NewCommandPage = lazy(() => import("./commands/new/NewCommandPage"));
const TemplatesListPage = lazy(
  () => import("./commands/templates/TemplatesListPage"),
);
const TemplateDetailPage = lazy(
  () => import("./commands/templates/TemplateDetailPage"),
);

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    {/* Legacy /devices/history → /devices/commands */}
    <Route
      path="history"
      element={<Navigate to="/devices/commands" replace />}
    />
    <Route
      path="commands"
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
    <Route
      path="commands/templates"
      element={
        <Suspense>
          <TemplatesListPage />
        </Suspense>
      }
    />
    <Route
      path="commands/templates/:templateId"
      element={
        <Suspense>
          <TemplateDetailPage />
        </Suspense>
      }
    />
    <Route path="*" element={<Device />} />
  </Routes>
);

export default Devices;
