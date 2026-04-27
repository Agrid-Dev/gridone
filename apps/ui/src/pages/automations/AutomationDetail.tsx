import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
} from "@/api/automations";
import { AutomationStatusBadge } from "./components/AutomationStatusBadge";
import { ExecutionStatusBadge } from "./components/ExecutionStatusBadge";

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

  const { data: executions = [], isLoading: executionsLoading } = useQuery({
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
  const triggerLabel = t(`triggers.${automation.trigger.type}`, {
    defaultValue: automation.trigger.type,
  });

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

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-y-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t("fields.name")}</span>
            <p className="mt-1 text-foreground">{automation.name}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("fields.status")}</span>
            <div className="mt-1">
              <AutomationStatusBadge enabled={automation.enabled} />
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">{t("fields.trigger")}</span>
            <p className="mt-1 text-foreground">{triggerLabel}</p>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t("fields.actionTemplate")}
            </span>
            <p className="mt-1 font-mono text-xs text-foreground">
              {automation.actionTemplateId}
            </p>
          </div>
        </div>
      </div>

      <ExecutionsSection
        executions={executions}
        isLoading={executionsLoading}
      />

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

function ExecutionsSection({
  executions,
  isLoading,
}: {
  executions: AutomationExecution[];
  isLoading: boolean;
}) {
  const { t } = useTranslation("automations");

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("executions.title")}</h3>
      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : executions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("executions.empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>{t("executions.triggeredAt")}</TableHead>
                <TableHead>{t("executions.executedAt")}</TableHead>
                <TableHead>{t("fields.status")}</TableHead>
                <TableHead>{t("executions.error")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((execution) => (
                <TableRow key={execution.id}>
                  <TableCell className="text-sm">
                    {new Date(execution.triggeredAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {execution.executedAt
                      ? new Date(execution.executedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <ExecutionStatusBadge status={execution.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {execution.error ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
