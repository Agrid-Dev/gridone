import { Route, Routes, useLocation } from "react-router";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import OperatingRulesList from "./OperatingRulesList";
import OperatingRuleDetail from "./OperatingRuleDetail";
import OperatingRuleFormPage from "./OperatingRuleForm";

export default function DeviceOperatingRules() {
  const { pathname } = useLocation();
  return (
    <ResourceBoundary resetKeys={[pathname]}>
      <Routes>
        <Route index element={<OperatingRulesList />} />
        <Route path="new" element={<OperatingRuleFormPage />} />
        <Route path=":operatingRuleId" element={<OperatingRuleDetail />} />
        <Route
          path=":operatingRuleId/edit"
          element={<OperatingRuleFormPage edit />}
        />
        <Route path="*" element={<NotFoundFallback />} />
      </Routes>
    </ResourceBoundary>
  );
}
