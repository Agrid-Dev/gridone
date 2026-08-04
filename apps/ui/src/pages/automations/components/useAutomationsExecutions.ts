import { useQueries } from "@tanstack/react-query";
import type { Automation } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  summarizeExecutions,
  type ExecutionsSummary,
} from "./executionsSummary";

export interface AutomationsExecutions extends ExecutionsSummary {
  isLoading: boolean;
}

/**
 * One `listExecutions` query per automation (the API exposes no aggregate
 * endpoint), merged client-side. Query keys mirror the detail page's
 * `["automations", id, "executions"]` so navigating there reuses the cache.
 */
export function useAutomationsExecutions(
  automations: Automation[],
): AutomationsExecutions {
  const client = useGridoneClient();
  const results = useQueries({
    queries: automations.map((automation) => ({
      queryKey: ["automations", automation.id, "executions"],
      queryFn: () => client.automations.listExecutions(automation.id!),
      enabled: !!automation.id,
    })),
  });

  const summary = summarizeExecutions(
    automations,
    results.map((result) => result.data),
    Date.now(),
  );
  return { ...summary, isLoading: results.some((result) => result.isLoading) };
}
