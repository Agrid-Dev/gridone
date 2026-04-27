import { Routes, Route } from "react-router";
import { lazy, FC, Suspense } from "react";

const AutomationsList = lazy(() => import("./AutomationsList"));
const NewAutomationPage = lazy(() => import("./NewAutomationPage"));
const AutomationDetail = lazy(() => import("./AutomationDetail"));
const EditAutomationPage = lazy(() => import("./EditAutomationPage"));

const Automations: FC = () => (
  <Routes>
    <Route
      index
      element={
        <Suspense>
          <AutomationsList />
        </Suspense>
      }
    />
    <Route
      path="new"
      element={
        <Suspense>
          <NewAutomationPage />
        </Suspense>
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
    <Route
      path=":automationId/edit"
      element={
        <Suspense>
          <EditAutomationPage />
        </Suspense>
      }
    />
  </Routes>
);

export default Automations;
