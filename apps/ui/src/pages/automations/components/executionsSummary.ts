import type { TFunction } from "i18next";
import type { Automation, AutomationExecution } from "@gridone/sdk";

export interface RecentExecution {
  execution: AutomationExecution;
  automationName: string;
}

export interface ExecutionsSummary {
  /** Latest execution per automation id — drives the per-card "last run". */
  lastByAutomation: Map<string, AutomationExecution>;
  /** Newest executions across all automations, capped for the side panel. */
  recent: RecentExecution[];
  /** Executions in the last 24 hours, across all automations. */
  count24h: number;
}

export const RECENT_EXECUTIONS_LIMIT = 8;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Timestamp an execution is reported at — completion time when available,
 *  trigger time otherwise (executions that failed before running). */
export function executionTime(execution: AutomationExecution): number {
  return new Date(execution.executed_at ?? execution.triggered_at).getTime();
}

/**
 * Merge per-automation execution lists (one API call per automation — there
 * is no aggregate endpoint) into the list page's summary. `executionsByIndex`
 * is positional: index i holds the executions of `automations[i]`, undefined
 * while that query is still loading.
 */
export function summarizeExecutions(
  automations: Automation[],
  executionsByIndex: (AutomationExecution[] | undefined)[],
  now: number,
): ExecutionsSummary {
  const lastByAutomation = new Map<string, AutomationExecution>();
  const all: RecentExecution[] = [];

  automations.forEach((automation, index) => {
    const executions = executionsByIndex[index];
    if (!automation.id || !executions) return;
    for (const execution of executions) {
      all.push({ execution, automationName: automation.name });
      const latest = lastByAutomation.get(automation.id);
      if (!latest || executionTime(execution) > executionTime(latest)) {
        lastByAutomation.set(automation.id, execution);
      }
    }
  });

  all.sort((a, b) => executionTime(b.execution) - executionTime(a.execution));

  return {
    lastByAutomation,
    recent: all.slice(0, RECENT_EXECUTIONS_LIMIT),
    count24h: all.filter(
      ({ execution }) => now - executionTime(execution) <= DAY_MS,
    ).length,
  };
}

/** "16:20" today, "hier 23:00" yesterday, "3 août 23:00" beyond — execution
 *  lists favor clock times (like a log) over relative wording. */
export function formatExecutionMoment(
  execution: AutomationExecution,
  language: string | undefined,
  t: TFunction<"automations">,
): string {
  const date = new Date(executionTime(execution));
  const time = date.toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return t("recentExecutions.yesterdayAt", { time });
  }
  const day = date.toLocaleDateString(language, {
    day: "numeric",
    month: "short",
  });
  return `${day} ${time}`;
}
