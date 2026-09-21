import { useTranslation } from "react-i18next";
import { ShieldCheck, Plus } from "lucide-react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import {
  useProtectionDevices,
  useProtections,
  protectionsPath,
  protectionPath,
} from "./useProtections";
import { ProtectionDiagnostics } from "./ProtectionFeedback";
import { ProtectionSummary } from "./ProtectionSummary";

export default function ProtectionsList() {
  const { t } = useTranslation("protections");
  const device = useDeviceFromRoute();
  const can = usePermissions();
  const { data: rows } = useProtections(device.id);
  const { data: devices } = useProtectionDevices();
  const createPath = `${protectionsPath(device.id)}/new`;
  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("intro", { device: device.name })}
        actions={
          can("protections:write") && (
            <Button asChild>
              <Link to={createPath}>
                <Plus className="h-4 w-4" />
                {t("create")}
              </Link>
            </Button>
          )
        }
      />
      {!rows.length ? (
        <ResourceEmpty
          resourceName={t("title")}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          showCreate={can("protections:write")}
          createTo={createPath}
          createLabel={t("create")}
        />
      ) : (
        <div className="grid gap-4">
          {rows.map(({ protection: rule, reasons }) => (
            <article
              key={rule.id}
              className="space-y-4 rounded-xl border bg-card p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                <Link
                  to={protectionPath(rule)}
                  className="font-semibold text-primary hover:underline"
                >
                  {rule.name}
                </Link>
                <Badge variant={rule.retirement ? "secondary" : "outline"}>
                  {t(rule.retirement ? "retired" : "active")}
                </Badge>
                {!!reasons?.length && (
                  <Badge variant="destructive">{t("invalidReference")}</Badge>
                )}
              </div>
              <ProtectionSummary
                rule={rule}
                catalog={{ devices, contracts: rule.points }}
              />
              <ProtectionDiagnostics reasons={reasons} />
            </article>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{t("limits")}</p>
    </section>
  );
}
