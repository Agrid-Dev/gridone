import { Routes, Route, Navigate } from "react-router";
import { lazy, FC, Suspense } from "react";
import DevicesList from "./DevicesList";
import Device from "./device";

const GroupsListPage = lazy(() => import("./groups/GroupsListPage"));
const GroupFormPage = lazy(() => import("./groups/GroupFormPage"));
const GroupDetailPage = lazy(() => import("./groups/GroupDetailPage"));

const CommandsPage = lazy(() => import("./commands/CommandsPage"));
const NewCommandPage = lazy(() => import("./commands/new/NewCommandPage"));
const TemplatesListPage = lazy(
  () => import("./commands/templates/TemplatesListPage"),
);
const TemplateDetailPage = lazy(
  () => import("./commands/templates/TemplateDetailPage"),
);
const ZoneMappingImportPage = lazy(
  () => import("./zone-import/ZoneMappingImportPage"),
);

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    <Route path="groups">
      <Route
        index
        element={
          <Suspense>
            <GroupsListPage />
          </Suspense>
        }
      />
      <Route
        path="new"
        element={
          <Suspense>
            <GroupFormPage />
          </Suspense>
        }
      />
      <Route
        path=":groupId"
        element={
          <Suspense>
            <GroupDetailPage />
          </Suspense>
        }
      />
      <Route
        path=":groupId/edit"
        element={
          <Suspense>
            <GroupFormPage />
          </Suspense>
        }
      />
    </Route>
    {/* Legacy /devices/history → /devices/commands */}
    <Route
      path="history"
      element={<Navigate to="/devices/commands" replace />}
    />
    <Route
      path="zone-mapping/import"
      element={
        <Suspense>
          <ZoneMappingImportPage />
        </Suspense>
      }
    />
    <Route path="commands">
      <Route
        index
        element={
          <Suspense>
            <CommandsPage />
          </Suspense>
        }
      />
      <Route
        path="new"
        element={
          <Suspense>
            <NewCommandPage />
          </Suspense>
        }
      />
      <Route path="templates">
        <Route
          index
          element={
            <Suspense>
              <TemplatesListPage />
            </Suspense>
          }
        />
        <Route
          path=":templateId"
          element={
            <Suspense>
              <TemplateDetailPage />
            </Suspense>
          }
        />
      </Route>
    </Route>
    <Route path="*" element={<Device />} />
  </Routes>
);

export default Devices;
