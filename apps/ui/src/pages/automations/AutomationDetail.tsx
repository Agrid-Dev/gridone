import { Link, useNavigate, useParams } from "react-router";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";
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
import {
  deleteAutomation,
  disableAutomation,
  enableAutomation,
  getAutomation,
  listExecutions,
  type AutomationExecution,
  type Trigger,
} from "@/api/automations";
import { getTemplate } from "@/api/commands";
import {
  getAssetTreeWithDevices,
  type Asset,
  type AssetTreeNode,
} from "@/api/assets";
import { CommandTemplatePresenter } from "@/pages/devices/commands/presenters/CommandTemplatePresenter";
import { AutomationStatusBadge } from "./components/AutomationStatusBadge";
import { ExecutionStatusBadge } from "./components/ExecutionStatusBadge";
import { TriggerPresenter } from "./presenters/TriggerPresenter";

export default function AutomationDetail() {
  const { t } = useTranslation("automations");
  const { automationId } = useParams<{ automationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = usePermissions();
  const id = automationId ?? "";
  const canWrite = can("automations:write");

  const { data: automation, isLoading } = useQuery({
    queryKey: ["automations", id],
    queryFn: () => getAutomation(id),
    enabled: !!id,
  });

  const { data: executions = [] } = useQuery({
    queryKey: ["automations", id, "executions"],
    queryFn: () => listExecutions(id),
    enabled: !!id,
  });

  const enableMutation = useMutation({
    mutationFn: () => enableAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: () => disableAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.removeQueries({ queryKey: ["automations", id] });
      toast.success(t("toasts.deleted"));
      navigate("/automations");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !automation) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

  const isBusy = enableMutation.isPending || disableMutation.isPending;

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={automation.name}
        resourceName={t("title")}
        resourceNameLinksBack
        backTo="/automations"
        actions={
          canWrite ? (
            <Button
              variant="outline"
              onClick={() =>
                automation.enabled
                  ? disableMutation.mutate()
                  : enableMutation.mutate()
              }
              disabled={isBusy}
            >
              {t(automation.enabled ? "actions.disable" : "actions.enable")}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <AutomationStatusBadge enabled={automation.enabled} />
        </div>
        {automation.description && (
          <p className="text-sm text-muted-foreground">
            {automation.description}
          </p>
        )}
      </div>

      <FlowSection
        trigger={automation.trigger}
        actionTemplateId={automation.actionTemplateId}
      />

      <ExecutionsSection executions={executions} />

      {canWrite && (
        <DangerZone
          onDelete={() => deleteMutation.mutate()}
          isDeleting={deleteMutation.isPending}
          confirmTitle={t("deleteConfirm.title")}
          confirmDetails={t("deleteConfirm.details", { name: automation.name })}
          deleteLabel={t("actions.delete")}
        />
      )}
    </section>
  );
}

function FlowSection({
  trigger,
  actionTemplateId,
}: {
  trigger: Trigger;
  actionTemplateId: string;
}) {
  const { t } = useTranslation("automations");
  return (
    <div className="space-y-3">
      <FlowCard
        label={t("flow.trigger")}
        sublabel={t(`triggers.${trigger.type}`, { defaultValue: trigger.type })}
      >
        <TriggerPresenter trigger={trigger} />
      </FlowCard>
      <div className="flex justify-center text-muted-foreground">
        <ArrowDown className="h-5 w-5" />
      </div>
      <FlowCard label={t("flow.action")} sublabel={t("fields.actionTemplate")}>
        <ActionPresenter templateId={actionTemplateId} />
      </FlowCard>
    </div>
  );
}

function FlowCard({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      </div>
      <Card>
        <CardContent className="py-5">{children}</CardContent>
      </Card>
    </div>
  );
}

function ActionPresenter({ templateId }: { templateId: string }) {
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
    <div className="space-y-3">
      <CommandTemplatePresenter
        template={template}
        assetsById={assetsById}
        className="border-0 shadow-none"
      />
      <Link
        to={`/devices/commands/templates/${encodeURIComponent(templateId)}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        {template.name ?? templateId}
      </Link>
    </div>
  );
}

function ExecutionsSection({
  executions,
}: {
  executions: AutomationExecution[];
}) {
  const { t } = useTranslation("automations");

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("executions.title")}</h3>
      {executions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("executions.empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>{t("executions.timestamp")}</TableHead>
                <TableHead>{t("fields.status")}</TableHead>
                <TableHead>{t("executions.output")}</TableHead>
                <TableHead>{t("executions.error")}</TableHead>
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
      <TableCell className="text-sm">
        {new Date(timestamp).toLocaleString()}
      </TableCell>
      <TableCell>
        <ExecutionStatusBadge status={execution.status} />
      </TableCell>
      <TableCell>
        {execution.outputId ? (
          <Link
            to={`/devices/commands?batch_id=${encodeURIComponent(execution.outputId)}`}
            className="inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {t("executions.viewBatch")}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {execution.error ?? "—"}
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
