import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Automation, AutomationExecution } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockUseQuery, mockUseQueries } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useQueries: (opts: { queries: { queryKey: unknown[] }[] }) =>
    mockUseQueries(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
  }),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    automations: {
      list: vi.fn(),
      enable: vi.fn(),
      disable: vi.fn(),
      listExecutions: vi.fn(),
    },
    devices: {
      get: vi.fn(),
      commandTemplates: { get: vi.fn() },
    },
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock(
    {
      title: "Automations",
      caption: "The rules that run the building",
      singular: "Automation",
      "actions.create": "New automation",
      "actions.enable": "Enable",
      "actions.disable": "Disable",
      "actions.edit": "Edit",
      "stats.active": "active",
      "stats.paused": "paused",
      "stats.executions24h": "executions (24 h)",
      "recentExecutions.title": "Recent executions",
      "executions.title": "Executions",
      "executions.empty": "No executions yet",
      "executions.emptyDescription": "History appears after the first run.",
      "card.lastExecuted": "Ran {{ago}}",
      "flow.trigger": "Trigger",
      "flow.action": "Action",
      "triggers.types.schedule": "Schedule",
      "triggers.types.change_event": "Attribute change",
      "triggers.unknownDevice": "Unknown device",
      "actions.types.command_template": "Run a command",
      "actions.types.notification": "Send a notification",
      "operators.gt": ">",
      "common.timeAgo.minutes": "{{count}} minutes ago",
      enabledBadge: "Enabled",
      disabledBadge: "Disabled",
      "empty.title": "No {{resourceName}} yet",
      "empty.details": "No {{resourceName}} details",
      "empty.new": "Create a {{resourceName}}",
    },
    // cronstrue output (schedule chips) is asserted in English.
    { language: "en" },
  ),
);

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AutomationsList from "./AutomationsList";

function makeAutomation(
  id: string,
  name: string,
  triggerType: string,
  enabled: boolean,
  description = "",
): Automation {
  return {
    id,
    name,
    description,
    enabled,
    action: {
      provider_id: "command_template",
      params: { template_id: `tpl-${id}` },
    },
    trigger:
      triggerType === "change_event"
        ? {
            provider_id: "change_event",
            params: {
              device_id: "dev-1",
              attribute: "temperature",
              condition: { operator: "gt", threshold: 26 },
            },
          }
        : { provider_id: triggerType, params: { cron: "0 23 * * *" } },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: "",
  };
}

function makeExecution(
  id: string,
  automationId: string,
  minutesAgo: number,
  status: AutomationExecution["status"] = "success",
): AutomationExecution {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id,
    automation_id: automationId,
    triggered_at: at,
    executed_at: at,
    status,
  };
}

let automations: Automation[] = [];
let executionsByAutomation: Record<string, AutomationExecution[]> = {};

function renderList() {
  return render(
    <MemoryRouter>
      <AutomationsList />
    </MemoryRouter>,
  );
}

function getCard(name: string | RegExp) {
  const cards = screen.getByRole("list", { name: "Automations" });
  const card = within(cards).getByRole("link", { name }).closest("li");
  if (!card) throw new Error("card not found");
  return card;
}

beforeEach(() => {
  automations = [];
  executionsByAutomation = {};
  mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === "automations") {
      return { data: automations, isLoading: false };
    }
    if (queryKey[0] === "devices") {
      return { data: { name: "Living-room sensor" }, isPending: false };
    }
    if (queryKey[0] === "command-templates") {
      return { data: { name: "Setpoint 18°" }, isPending: false };
    }
    return { data: undefined, isLoading: false };
  });
  mockUseQueries.mockImplementation(
    ({ queries }: { queries: { queryKey: unknown[] }[] }) =>
      queries.map(({ queryKey }) => ({
        data: executionsByAutomation[queryKey[1] as string] ?? [],
        isLoading: false,
      })),
  );
});

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockUseQueries.mockReset();
});

describe("AutomationsList", () => {
  it("renders ResourceEmpty when no automations exist", () => {
    renderList();
    expect(screen.getByText(/No automation yet/i)).toBeInTheDocument();
  });

  it("renders a card per automation with description, rule chips, and toggle state", () => {
    automations = [
      makeAutomation(
        "a1",
        "Morning warmup",
        "schedule",
        true,
        "Boost heating before occupants arrive",
      ),
      makeAutomation("a2", "Cold alarm", "change_event", false),
    ];
    renderList();

    const morning = getCard("Morning warmup");
    expect(
      within(morning).getByText("Boost heating before occupants arrive"),
    ).toBeInTheDocument();
    // Schedule chip: humanized cron (cronstrue, real implementation).
    expect(
      within(morning).getByText("At 11:00 PM, every day"),
    ).toBeInTheDocument();
    // Action chip: the command template's name.
    expect(within(morning).getByText("Setpoint 18°")).toBeInTheDocument();
    expect(within(morning).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    const cold = getCard("Cold alarm");
    // Change-event chip: device · attribute operator threshold.
    expect(
      within(cold).getByText("Living-room sensor · Temperature > 26"),
    ).toBeInTheDocument();
    expect(within(cold).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("offers an explicit edit link per card, next to the toggle", () => {
    automations = [makeAutomation("a1", "Morning warmup", "schedule", true)];
    renderList();

    const card = getCard("Morning warmup");
    expect(within(card).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/automations/a1",
    );
  });

  it("summarizes active/paused counts and 24h executions in the stat pills", () => {
    automations = [
      makeAutomation("a1", "Morning warmup", "schedule", true),
      makeAutomation("a2", "Cold alarm", "change_event", false),
    ];
    executionsByAutomation = {
      a1: [makeExecution("e1", "a1", 25), makeExecution("e2", "a1", 60)],
    };
    renderList();

    const pills = screen.getByText("active").closest("div");
    if (!pills) throw new Error("stat pills row not found");
    expect(within(pills).getByText("active").previousSibling).toHaveTextContent(
      "1",
    );
    expect(within(pills).getByText("paused").previousSibling).toHaveTextContent(
      "1",
    );
    expect(
      within(pills).getByText("executions (24 h)").previousSibling,
    ).toHaveTextContent("2");
  });

  it("shows the last execution on the card and merges recents into the panel", () => {
    automations = [
      makeAutomation("a1", "Morning warmup", "schedule", true),
      makeAutomation("a2", "Cold alarm", "change_event", true),
    ];
    executionsByAutomation = {
      a1: [makeExecution("e1", "a1", 25)],
      a2: [makeExecution("e2", "a2", 10, "failed")],
    };
    renderList();

    expect(
      within(getCard("Morning warmup")).getByText("Ran 25 minutes ago"),
    ).toBeInTheDocument();

    const panel = screen
      .getByText("Recent executions")
      .closest("div")?.parentElement;
    if (!panel) throw new Error("recent executions panel not found");
    const links = within(panel).getAllByRole("link");
    // Sorted newest first: Cold alarm (10 min) before Morning warmup (25 min).
    expect(links[0]).toHaveTextContent("Cold alarm");
    expect(links[1]).toHaveTextContent("Morning warmup");
  });
});
