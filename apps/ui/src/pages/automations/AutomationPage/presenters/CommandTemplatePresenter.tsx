import { Link } from "react-router";
import { type FC } from "react";
import { useTranslation } from "react-i18next";
import { type TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

import type { CommandTemplateResponse } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { DevicesFilter } from "@/lib/devices";
import { useAssetTree } from "@/hooks/useAssetTree";
import { TargetPresenter } from "@/pages/devices/commands/presenters/TargetPresenter";
import { WritePresenter } from "@/pages/devices/commands/presenters/WritePresenter";

const CommandTemplatePresenter: FC<{ templateId: string }> = ({
  templateId,
}) => {
  const { t } = useTranslation("automations");
  const client = useGridoneClient();
  const { data: template, isLoading } = useQuery({
    queryKey: ["command-templates", templateId],
    queryFn: () => client.devices.commandTemplates.get(templateId),
    enabled: !!templateId,
  });

  const { assetsById } = useAssetTree();

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!template) return null;

  return (
    <div className="space-y-5">
      {template.name && <TemplateName template={template} t={t} />}
      <div className="space-y-4">
        <TargetPresenter
          target={template.target as DevicesFilter}
          assetsById={assetsById}
        />
        <WritePresenter write={template.write} />
      </div>
    </div>
  );
};

function TemplateName({
  template,
  t,
}: {
  template: CommandTemplateResponse;
  t: TFunction<"automations">;
}) {
  return (
    <Link
      to={`/devices/commands/templates/${encodeURIComponent(template.id)}`}
      className="group inline-flex items-center gap-1.5 text-base font-semibold text-foreground hover:text-primary"
    >
      {template.name}
      <ExternalLink
        aria-label={t("fields.actionTemplate")}
        className="h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-hover:text-primary"
      />
    </Link>
  );
}

export default CommandTemplatePresenter;
