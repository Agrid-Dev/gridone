import { Route, Routes, useLocation } from "react-router";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import DocumentsList from "./DocumentsList";
import DocumentDetail from "./DocumentDetail";
import { DocumentForm, DocumentEdit } from "./DocumentForm";

export default function Documents() {
  const { pathname } = useLocation();
  return (
    <RequirePermission permission="documents:read">
      <ResourceBoundary resetKeys={[pathname]}>
        <Routes>
          <Route index element={<DocumentsList />} />
          <Route
            path="new"
            element={
              <RequirePermission permission="documents:write">
                <DocumentForm />
              </RequirePermission>
            }
          />
          <Route path=":documentId" element={<DocumentDetail />} />
          <Route
            path=":documentId/edit"
            element={
              <RequirePermission permission="documents:write">
                <DocumentEdit />
              </RequirePermission>
            }
          />
          <Route path="*" element={<NotFoundFallback />} />
        </Routes>
      </ResourceBoundary>
    </RequirePermission>
  );
}
