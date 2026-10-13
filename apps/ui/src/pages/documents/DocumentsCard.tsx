import { useTranslation } from "react-i18next";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermissions } from "@/contexts/AuthContext";
import { DocumentRows } from "./DocumentRows";

export function DocumentsCard({
  assetId,
  deviceId,
}: {
  assetId?: string;
  deviceId?: string;
}) {
  const { t } = useTranslation("documents");
  const can = usePermissions();
  if (!can("documents:read")) return null;
  const query = new URLSearchParams(
    assetId ? { asset_id: assetId } : { device_id: deviceId! },
  ).toString();
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>{t("title")}</CardTitle>
        {can("documents:write") && (
          <Button asChild variant="outline">
            <Link to={`/documents/new?${query}`}>{t("add")}</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <ResourceBoundary resetKeys={[assetId, deviceId]}>
          <DocumentRows
            compact
            params={{ asset_id: assetId, device_id: deviceId, size: 5 }}
          />
        </ResourceBoundary>
        <Button asChild variant="link">
          <Link to={`/documents?${query}`}>{t("seeAll")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
