import { Routes, Route } from "react-router";
import { lazy, FC, Suspense } from "react";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";

const AutomationsList = lazy(() => import("./AutomationsList"));
const NewAutomationPage = lazy(() => import("./NewAutomationPage"));
const AutomationDetail = lazy(() => import("./AutomationPage/AutomationPage"));

const Automations: FC = () => (
  <RequirePermission permission="automations:read">
    <Routes>
      <Route
        index
        element={
          <ResourceBoundary resetKeys={[]}>
            <AutomationsList />
          </ResourceBoundary>
        }
      />
      <Route
        path="new"
        element={
          <RequirePermission permission="automations:write">
            <Suspense>
              <NewAutomationPage />
            </Suspense>
          </RequirePermission>
        }
      />
      <Route
        path=":automationId"
        element={
          <Suspense>
            <AutomationDetail />
          </Suspense>
        }
      />
    </Routes>
  </RequirePermission>
);

export default Automations;
