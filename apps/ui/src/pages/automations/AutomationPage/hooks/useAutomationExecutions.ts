import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AutomationExecution } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { DAY_MS, executionTime } from "../../components/executionsSummary";

/** One automation's execution log, newest first, with the two figures the
 *  page header reads: the 24 h count and the latest run. */
export function useAutomationExecutions(automationId: string) {
  const client = useGridoneClient();
  const { data, isLoading } = useQuery<AutomationExecution[]>({
    queryKey: ["automations", automationId, "executions"],
    queryFn: () => client.automations.listExecutions(automationId),
    enabled: !!automationId,
  });

  const executions = useMemo(
    () => [...(data ?? [])].sort((a, b) => executionTime(b) - executionTime(a)),
    [data],
  );

  const now = Date.now();
  return {
    executions,
    isLoading,
    last: executions.at(0),
    count24h: executions.filter(
      (execution) => now - executionTime(execution) <= DAY_MS,
    ).length,
  };
}
