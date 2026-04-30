import { Routes, Route } from "react-router";
import { lazy, FC, Suspense } from "react";

const AutomationsList = lazy(() => import("./AutomationsList"));
const NewAutomationPage = lazy(() => import("./NewAutomationPage"));
const AutomationDetail = lazy(() => import("./AutomationPage/AutomationPage"));

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
  </Routes>
);

export default Automations;
