import { Route, Routes, useLocation } from "react-router";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import ProtectionsList from "./ProtectionsList";
import ProtectionDetail from "./ProtectionDetail";
import ProtectionFormPage from "./ProtectionForm";

export default function DeviceProtections() {
  const { pathname } = useLocation();
  return (
    <ResourceBoundary resetKeys={[pathname]}>
      <Routes>
        <Route index element={<ProtectionsList />} />
        <Route path="new" element={<ProtectionFormPage />} />
        <Route path=":protectionId" element={<ProtectionDetail />} />
        <Route
          path=":protectionId/edit"
          element={<ProtectionFormPage edit />}
        />
        <Route path="*" element={<NotFoundFallback />} />
      </Routes>
    </ResourceBoundary>
  );
}
