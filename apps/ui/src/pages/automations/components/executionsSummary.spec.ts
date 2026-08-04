import { describe, it, expect } from "vitest";
import type { Automation, AutomationExecution } from "@gridone/sdk";
import {
  executionTime,
  RECENT_EXECUTIONS_LIMIT,
  summarizeExecutions,
} from "./executionsSummary";

const NOW = new Date("2026-08-04T12:00:00Z").getTime();

function automation(id: string, name: string): Automation {
  return {
    id,
    name,
    trigger: { provider_id: "schedule", params: {} },
    action: { provider_id: "command_template", params: {} },
  };
}

function execution(
  id: string,
  automationId: string,
  minutesAgo: number,
  overrides: Partial<AutomationExecution> = {},
): AutomationExecution {
  const at = new Date(NOW - minutesAgo * 60_000).toISOString();
  return {
    id,
    automation_id: automationId,
    triggered_at: at,
    executed_at: at,
    status: "success",
    ...overrides,
  };
}

describe("executionTime", () => {
  it("prefers executed_at and falls back to triggered_at", () => {
    const withExec = execution("e1", "a1", 5);
    expect(executionTime(withExec)).toBe(
      new Date(withExec.executed_at!).getTime(),
    );

    const pending = execution("e2", "a1", 5, { executed_at: null });
    expect(executionTime(pending)).toBe(
      new Date(pending.triggered_at).getTime(),
    );
  });
});

describe("summarizeExecutions", () => {
  it("keeps the latest execution per automation regardless of list order", () => {
    const { lastByAutomation } = summarizeExecutions(
      [automation("a1", "Warmup")],
      [[execution("old", "a1", 120), execution("new", "a1", 10)]],
      NOW,
    );
    expect(lastByAutomation.get("a1")?.id).toBe("new");
  });

  it("merges executions across automations, newest first, tagged with names", () => {
    const { recent } = summarizeExecutions(
      [automation("a1", "Warmup"), automation("a2", "Alarm")],
      [[execution("e1", "a1", 30)], [execution("e2", "a2", 5)]],
      NOW,
    );
    expect(recent.map((r) => r.execution.id)).toEqual(["e2", "e1"]);
    expect(recent.map((r) => r.automationName)).toEqual(["Alarm", "Warmup"]);
  });

  it("caps the recent list", () => {
    const many = Array.from({ length: RECENT_EXECUTIONS_LIMIT + 3 }, (_, i) =>
      execution(`e${i}`, "a1", i),
    );
    const { recent } = summarizeExecutions(
      [automation("a1", "Warmup")],
      [many],
      NOW,
    );
    expect(recent).toHaveLength(RECENT_EXECUTIONS_LIMIT);
  });

  it("counts only executions within the last 24 hours", () => {
    const { count24h } = summarizeExecutions(
      [automation("a1", "Warmup")],
      [
        [
          execution("in1", "a1", 60),
          execution("in2", "a1", 23 * 60),
          execution("out", "a1", 25 * 60),
        ],
      ],
      NOW,
    );
    expect(count24h).toBe(2);
  });

  it("skips automations whose executions are still loading", () => {
    const summary = summarizeExecutions(
      [automation("a1", "Warmup"), automation("a2", "Alarm")],
      [undefined, [execution("e1", "a2", 5)]],
      NOW,
    );
    expect(summary.lastByAutomation.has("a1")).toBe(false);
    expect(summary.recent).toHaveLength(1);
  });
});
