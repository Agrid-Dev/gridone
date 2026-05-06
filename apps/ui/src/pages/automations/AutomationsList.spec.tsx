import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Automation } from "@/api/automations";
import { createI18nMock } from "@/test/i18nMock";

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
  }),
}));

vi.mock("@/api/automations", () => ({
  listAutomations: vi.fn(),
  enableAutomation: vi.fn(),
  disableAutomation: vi.fn(),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Automations",
    subtitle: "Trigger-driven actions",
    singular: "Automation",
    "fields.name": "Name",
    "fields.trigger": "Trigger",
    "fields.status": "Status",
    "actions.create": "New automation",
    "actions.enable": "Enable",
    "actions.disable": "Disable",
    "actions.rowMenu": "Actions",
    "triggers.types.schedule": "Schedule",
    "triggers.types.change_event": "Attribute change",
    enabledBadge: "Enabled",
    disabledBadge: "Disabled",
    "empty.title": "No {{resourceName}} yet",
    "empty.details": "No {{resourceName}} details",
    "empty.new": "Create a {{resourceName}}",
  }),
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
      providerId: "command_template",
      params: { templateId: `tpl-${id}` },
    },
    trigger: { providerId: triggerType, params: {} },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: "",
  };
}

function renderList() {
  return render(
    <MemoryRouter>
      <AutomationsList />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseQuery.mockReturnValue({ data: [], isLoading: false });
});

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
});

describe("AutomationsList", () => {
  it("renders ResourceEmpty when no automations exist", () => {
    renderList();
    expect(screen.getByText(/No automation yet/i)).toBeInTheDocument();
  });

  it("renders a row per automation with description, trigger label, and status", () => {
    mockUseQuery.mockReturnValue({
      data: [
        makeAutomation(
          "a1",
          "Morning warmup",
          "schedule",
          true,
          "Boost heating before occupants arrive",
        ),
        makeAutomation("a2", "Cold alarm", "change_event", false),
      ],
      isLoading: false,
    });
    renderList();

    const morning = screen.getByRole("row", { name: /Morning warmup/ });
    expect(
      within(morning).getByText("Boost heating before occupants arrive"),
    ).toBeInTheDocument();
    expect(within(morning).getByText("Schedule")).toBeInTheDocument();
    expect(within(morning).getByText("Enabled")).toBeInTheDocument();

    const cold = screen.getByRole("row", { name: /Cold alarm/ });
    expect(within(cold).getByText("Attribute change")).toBeInTheDocument();
    expect(within(cold).getByText("Disabled")).toBeInTheDocument();
  });
});
