import { FC } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AutomationExecution } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History, ArrowRight } from "lucide-react";
import { ExecutionStatusBadge } from "../components/ExecutionStatusBadge";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

const useAutomationExecutions = (automationId: string) => {
  const client = useGridoneClient();
  return useQuery<AutomationExecution[]>({
    queryKey: ["automations", automationId, "executions"],
    queryFn: () => client.automations.listExecutions(automationId),
    enabled: !!automationId,
  });
};

interface AutomationExecutionHistoryProps {
  automationId: string;
}

function ExecutionRow({ execution }: { execution: AutomationExecution }) {
  const { t } = useTranslation("automations");
  const timestamp = execution.executed_at ?? execution.triggered_at;
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
          {execution.output_id && (
            <Link
              to={`/devices/commands?batch_id=${encodeURIComponent(execution.output_id)}`}
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

const AutomationExecutionHistory: FC<AutomationExecutionHistoryProps> = ({
  automationId,
}) => {
  const { data: executions, isLoading } = useAutomationExecutions(automationId);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!executions) {
    return <div>No executions found</div>;
  }

  return <ExecutionsSection executions={executions} />;
};

export default AutomationExecutionHistory;
