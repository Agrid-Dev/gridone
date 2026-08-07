import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Automation, AutomationExecution } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { SEMANTIC_BG_CLASS } from "@/lib/semanticColors";
import { cn, formatTimeAgo } from "@/lib/utils";
import { getTriggerDescriptor } from "./AutomationPage/presenters/triggerRegistry";
import { AutomationStatusBadge } from "./components/AutomationStatusBadge";
import { RuleSentence } from "./components/RuleSentence";
import { StatPill } from "./components/StatPill";
import { RecentExecutionsPanel } from "./components/RecentExecutionsPanel";
import { useAutomationsExecutions } from "./components/useAutomationsExecutions";
import { executionTime } from "./components/executionsSummary";

export default function AutomationsList() {
  const { t } = useTranslation("automations");
  const can = usePermissions();
  const queryClient = useQueryClient();
  const client = useGridoneClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["automations"],
    queryFn: () => client.automations.list(),
  });

  const executions = useAutomationsExecutions(automations);

  const enableMutation = useMutation({
    mutationFn: (id: string) => client.automations.enable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.enabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => client.automations.disable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      toast.success(t("toasts.disabled"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isMutating = enableMutation.isPending || disableMutation.isPending;
  const canWrite = can("automations:write");
  const activeCount = automations.filter((a) => a.enabled ?? true).length;
  const pausedCount = automations.length - activeCount;

  const header = (
    <ResourceHeader
      title={t("title")}
      caption={t("caption")}
      actions={
        canWrite ? (
          <Button asChild size="sm">
            <Link to="/automations/new">
              <Plus />
              {t("actions.create")}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (isLoading) {
    return (
      <section className="space-y-6">
        {header}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </section>
    );
  }

  if (automations.length === 0) {
    return (
      <section className="space-y-6">
        {header}
        <ResourceEmpty
          resourceName={t("singular").toLowerCase()}
          showCreate={canWrite}
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <StatPill
          count={activeCount}
          label={t("stats.active", { count: activeCount })}
          dotClassName={SEMANTIC_BG_CLASS.ok}
        />
        <StatPill count={pausedCount} label={t("stats.paused")} />
        {!executions.isLoading && (
          <StatPill
            count={executions.count24h}
            label={t("stats.executions24h", { count: executions.count24h })}
            icon={Play}
          />
        )}
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ul aria-label={t("title")} className="space-y-3">
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              lastExecution={
                automation.id
                  ? executions.lastByAutomation.get(automation.id)
                  : undefined
              }
              canWrite={canWrite}
              isMutating={isMutating}
              onToggle={() =>
                automation.enabled
                  ? disableMutation.mutate(automation.id!)
                  : enableMutation.mutate(automation.id!)
              }
            />
          ))}
        </ul>
        <RecentExecutionsPanel
          recent={executions.recent}
          isLoading={executions.isLoading}
        />
      </div>
    </section>
  );
}

function AutomationCard({
  automation,
  lastExecution,
  canWrite,
  isMutating,
  onToggle,
}: {
  automation: Automation;
  lastExecution?: AutomationExecution;
  canWrite: boolean;
  isMutating: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("automations");
  const { t: tCommon } = useTranslation("common");
  const enabled = automation.enabled ?? true;
  const Icon = getTriggerDescriptor(automation.trigger.provider_id).icon;

  return (
    <li>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary",
              !enabled && "opacity-50",
            )}
          >
            <Icon aria-hidden className="h-4 w-4" />
          </span>
          <div
            className={cn(
              "min-w-0 flex-1 space-y-2.5",
              !enabled && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <Link
                to={`/automations/${automation.id}`}
                className="font-display text-base font-semibold hover:underline"
              >
                {automation.name}
              </Link>
              {automation.description && (
                <p className="truncate text-sm text-muted-foreground">
                  {automation.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <RuleSentence
                trigger={automation.trigger}
                action={automation.action}
              />
              {lastExecution && (
                <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      lastExecution.status === "success"
                        ? SEMANTIC_BG_CLASS.ok
                        : SEMANTIC_BG_CLASS.error,
                    )}
                  />
                  {t("card.lastExecuted", {
                    ago: formatTimeAgo(executionTime(lastExecution), tCommon),
                  })}
                </span>
              )}
            </div>
          </div>
          {canWrite ? (
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={isMutating}
              // Running/paused is a status, not a brand action — green when on.
              className={enabled ? "bg-success" : undefined}
              aria-label={t(enabled ? "actions.disable" : "actions.enable")}
            />
          ) : (
            <AutomationStatusBadge enabled={enabled} />
          )}
        </div>
      </Card>
    </li>
  );
}
