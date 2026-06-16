import { type FC } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Play, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import type { Device } from "@/api/devices";
import { usePermissions } from "@/contexts/AuthContext";
import { CommandTemplatePresenter } from "../presenters/CommandTemplatePresenter";
import { TemplateExecutions } from "./TemplateExecutions";
import { useTemplate } from "./useTemplate";

export const TemplateDetailContent: FC = () => {
  const { t } = useTranslation(["devices", "common"]);
  const can = usePermissions();
  const { templateId } = useParams<{ templateId: string }>();
  if (!templateId) {
    throw new Error("TemplateDetailPage requires a 'templateId' route param");
  }
  const {
    template,
    assetsById,
    resolvedDevices,
    isResolving,
    execute,
    isExecuting,
    remove,
    isRemoving,
  } = useTemplate(templateId);

  return (
    <section className="space-y-6">
      <ResourceHeader
        resourceName={t("commands.templates.title")}
        title={template.name ?? t("commands.templates.untitled")}
        actions={
          can("devices:write") && (
            <>
              <Button
                size="sm"
                onClick={execute}
                disabled={isExecuting || resolvedDevices.length === 0}
              >
                <Play />
                {isExecuting
                  ? t("commands.templates.executing")
                  : t("commands.templates.execute")}
              </Button>
              <ConfirmButton
                size="sm"
                variant="outline"
                confirmTitle={t("commands.templates.deleteTitle")}
                confirmDetails={t("commands.templates.deleteHint")}
                confirmLabel={t("common:common.delete")}
                onConfirm={remove}
                disabled={isRemoving}
              >
                <Trash2 />
                {t("common:common.delete")}
              </ConfirmButton>
            </>
          )
        }
      />

      <CommandTemplatePresenter template={template} assetsById={assetsById} />

      <ResolvedDevicesSection
        devices={resolvedDevices}
        isLoading={isResolving}
      />

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("commands.templates.executions")}
        </h3>
        <TemplateExecutions templateId={templateId} />
      </section>
    </section>
  );
};

const TemplateDetailPage: FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  return (
    <ResourceBoundary resetKeys={[templateId]}>
      <TemplateDetailContent />
    </ResourceBoundary>
  );
};

export default TemplateDetailPage;

function ResolvedDevicesSection({
  devices,
  isLoading,
}: {
  devices: Device[];
  isLoading: boolean;
}) {
  const { t } = useTranslation("devices");

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("commands.templates.resolvedHeader", { count: devices.length })}
        </h3>
        <Badge variant="outline" className="gap-1.5 text-muted-foreground">
          <RefreshCw className="h-3 w-3" />
          {t("commands.templates.dynamicHint")}
        </Badge>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-md" />
      ) : devices.length === 0 ? (
        <Card>
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            {t("commands.templates.noResolvedDevices")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-3">
            <ul className="max-h-48 overflow-y-auto divide-y text-sm">
              {devices.map((d) => (
                <li key={d.id} className="py-1.5">
                  <Link
                    to={`/devices/${encodeURIComponent(d.id)}`}
                    className="hover:underline"
                  >
                    {d.name || d.id}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
