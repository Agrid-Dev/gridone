import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { get: vi.fn(), commandTemplates: { get: vi.fn() } },
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock(
    {
      "flow.trigger": "Trigger",
      "flow.action": "Action",
      "triggers.types.schedule": "Schedule",
      "triggers.types.unknown": "Unknown trigger",
      "triggers.unknownDevice": "Unknown device",
      "actions.types.command_template": "Run a command",
      "actions.types.notification": "Send a notification",
      "operators.gte": "≥",
    },
    { language: "en" },
  ),
);

import { RuleSentence } from "./RuleSentence";

beforeEach(() => {
  mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === "devices" && queryKey[1]) {
      return { data: { name: "Boiler room probe" }, isPending: false };
    }
    if (queryKey[0] === "command-templates" && queryKey[1]) {
      return { data: { name: "Night setback" }, isPending: false };
    }
    return { data: undefined, isPending: false };
  });
});

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
});

describe("RuleSentence", () => {
  it("describes a schedule trigger with the humanized cron", () => {
    render(
      <RuleSentence
        trigger={{ provider_id: "schedule", params: { cron: "0 4 * * 0" } }}
        action={{
          provider_id: "notification",
          params: { title: "Weekly purge" },
        }}
      />,
    );
    expect(screen.getByText("At 04:00 AM, only on Sunday")).toBeInTheDocument();
    expect(screen.getByText("Weekly purge")).toBeInTheDocument();
  });

  it("describes a change-event trigger as device · attribute condition", () => {
    render(
      <RuleSentence
        trigger={{
          provider_id: "change_event",
          params: {
            device_id: "dev-9",
            attribute: "supply_temperature",
            condition: { operator: "gte", threshold: 80 },
          },
        }}
        action={{
          provider_id: "command_template",
          params: { template_id: "tpl-1" },
        }}
      />,
    );
    expect(
      screen.getByText("Boiler room probe · Supply Temperature ≥ 80"),
    ).toBeInTheDocument();
    // Command chip resolves the template name.
    expect(screen.getByText("Night setback")).toBeInTheDocument();
  });

  it("falls back to type labels for unknown params", () => {
    render(
      <RuleSentence
        trigger={{ provider_id: "schedule", params: { cron: "not a cron" } }}
        action={{ provider_id: "command_template", params: {} }}
      />,
    );
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Run a command")).toBeInTheDocument();
  });

  it("renders dashed placeholders for missing sides", () => {
    render(<RuleSentence />);
    expect(screen.getByText("Trigger")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });
});
