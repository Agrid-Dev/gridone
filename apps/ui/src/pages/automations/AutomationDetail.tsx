import { Link, useParams } from "react-router";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  ExternalLink,
  History,
  Terminal,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DangerZone } from "@/components/DangerZone";
import { usePermissions } from "@/contexts/AuthContext";
import { type AutomationExecution } from "@/api/automations";
import { getTemplate, type CommandTemplate } from "@/api/commands";
import {
  getAssetTreeWithDevices,
  type Asset,
  type AssetTreeNode,
} from "@/api/assets";
import { TargetPresenter } from "@/pages/devices/commands/presenters/TargetPresenter";
import { WritePresenter } from "@/pages/devices/commands/presenters/WritePresenter";
import { AutomationStatusBadge } from "./components/AutomationStatusBadge";
import { ExecutionStatusBadge } from "./components/ExecutionStatusBadge";
import { TriggerPresenter } from "./presenters/TriggerPresenter";
import { useAutomation } from "./useAutomation";

const TRIGGER_ICONS: Record<string, LucideIcon> = {
  schedule: Clock,
  change_event: TrendingUp,
};

export default function AutomationDetail() {
  const { t } = useTranslation("automations");
  const { automationId } = useParams<{ automationId: string }>();
  const can = usePermissions();
  const canWrite = can("automations:write");
  const {
    automation,
    isLoading,
    executions,
    enable,
    disable,
    isToggling,
    remove,
    isDeleting,
  } = useAutomation(automationId ?? "");

  if (isLoading || !automation) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

  const triggerSubtype = t(`triggers.${automation.trigger.type}`, {
    defaultValue: automation.trigger.type,
  });

  return (
    <section className="space-y-8">
      <ResourceHeader
        title={automation.name}
        resourceName={t("title")}
        resourceNameLinksBack
        backTo="/automations"
        actions={
          canWrite ? (
            <Button
              variant="outline"
              onClick={automation.enabled ? disable : enable}
              disabled={isToggling}
            >
              {t(automation.enabled ? "actions.disable" : "actions.enable")}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <AutomationStatusBadge enabled={automation.enabled} />
        {automation.description && (
          <p className="text-sm leading-relaxed text-foreground/80">
            {automation.description}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <FlowCard
          icon={TRIGGER_ICONS[automation.trigger.type] ?? Zap}
          type={t("flow.trigger")}
          subtype={triggerSubtype}
        >
          <TriggerPresenter trigger={automation.trigger} />
        </FlowCard>

        <FlowConnector />

        <FlowCard
          icon={Terminal}
          type={t("flow.action")}
          subtype={t("flow.actionType.command")}
        >
          <ActionContent templateId={automation.actionTemplateId} />
        </FlowCard>
      </div>

      <ExecutionsSection executions={executions} />

      {canWrite && (
        <DangerZone
          onDelete={remove}
          isDeleting={isDeleting}
          confirmTitle={t("deleteConfirm.title")}
          confirmDetails={t("deleteConfirm.details", { name: automation.name })}
          deleteLabel={t("actions.delete")}
        />
      )}
    </section>
  );
}

function FlowCard({
  icon: Icon,
  type,
  subtype,
  children,
}: {
  icon: LucideIcon;
  type: string;
  subtype: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">
          {type}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </span>

          <span className="text-sm font-semibold text-foreground/90">
            {subtype}
          </span>
        </div>
        <div className="pl-4 border-l-2 border-l-primary">{children}</div>
      </CardContent>
    </Card>
  );
}

function FlowConnector() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <div className="flex flex-col items-center text-muted-foreground/50">
        <div className="h-10 w-px border-l border-dashed border-current" />
        <ChevronDown className="-mt-1 h-4 w-4" strokeWidth={2.5} />
      </div>
    </div>
  );
}

function ActionContent({ templateId }: { templateId: string }) {
  const { t } = useTranslation("automations");
  const { data: template, isLoading } = useQuery({
    queryKey: ["command-templates", templateId],
    queryFn: () => getTemplate(templateId),
    enabled: !!templateId,
  });

  const { data: assetTree = [] } = useQuery<AssetTreeNode[]>({
    queryKey: ["assets", "tree-with-devices"],
    queryFn: getAssetTreeWithDevices,
  });

  const assetsById = useMemo(() => flattenAssets(assetTree), [assetTree]);

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!template) return null;

  return (
    <div className="space-y-5">
      {template.name && <TemplateName template={template} t={t} />}
      <div className="space-y-4">
        <TargetPresenter target={template.target} assetsById={assetsById} />
        <WritePresenter write={template.write} />
      </div>
    </div>
  );
}

function TemplateName({
  template,
  t,
}: {
  template: CommandTemplate;
  t: (k: string) => string;
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

function ExecutionsSection({
  executions,
}: {
  executions: AutomationExecution[];
}) {
  const { t } = useTranslation("automations");

  return (
    <div className="space-y-3 border-t border-border/60 pt-6">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">
          {t("executions.title")}
        </h3>
      </div>
      {executions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("executions.empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-48">
                  {t("executions.timestamp")}
                </TableHead>
                <TableHead>{t("fields.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((execution) => (
                <ExecutionRow key={execution.id} execution={execution} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ExecutionRow({ execution }: { execution: AutomationExecution }) {
  const { t } = useTranslation("automations");
  const timestamp = execution.executedAt ?? execution.triggeredAt;
  return (
    <TableRow>
      <TableCell className="text-sm tabular-nums">
        {new Date(timestamp).toLocaleString()}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ExecutionStatusBadge status={execution.status} />
          {execution.error && (
            <span className="text-sm text-destructive/90">
              {execution.error}
            </span>
          )}
          {execution.outputId && (
            <Link
              to={`/devices/commands?batch_id=${encodeURIComponent(execution.outputId)}`}
              className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("executions.viewBatch")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function flattenAssets(tree: AssetTreeNode[]): Record<string, Asset> {
  const out: Record<string, Asset> = {};
  const walk = (nodes: AssetTreeNode[]) => {
    for (const n of nodes) {
      out[n.id] = {
        id: n.id,
        parentId: n.parentId,
        type: n.type,
        name: n.name,
        path: n.path,
        position: n.position,
      };
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}
