import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Automation } from "@/api/automations";

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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      const map: Record<string, string> = {
        title: "Automations",
        subtitle: "Trigger-driven actions",
        singular: "Automation",
        "fields.name": "Name",
        "fields.trigger": "Trigger",
        "fields.status": "Status",
        "actions.create": "New automation",
        "actions.enable": "Enable",
        "actions.disable": "Disable",
        "triggers.schedule": "Schedule",
        "triggers.change_event": "Attribute change",
        enabledBadge: "Enabled",
        disabledBadge: "Disabled",
      };
      if (key === "empty.title") return `No ${opts?.resourceName ?? ""} yet`;
      if (key === "empty.details")
        return `No ${opts?.resourceName ?? ""} details`;
      if (key === "empty.new") return `Create a ${opts?.resourceName ?? ""}`;
      if (map[key] !== undefined) return map[key];
      return opts?.defaultValue ?? key;
    },
  }),
}));

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
): Automation {
  return {
    id,
    name,
    enabled,
    actionTemplateId: `tpl-${id}`,
    trigger: { type: triggerType },
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

  it("renders a row per automation with translated trigger label and status", () => {
    mockUseQuery.mockReturnValue({
      data: [
        makeAutomation("a1", "Morning warmup", "schedule", true),
        makeAutomation("a2", "Cold alarm", "change_event", false),
      ],
      isLoading: false,
    });
    renderList();

    const morning = screen.getByRole("row", { name: /Morning warmup/ });
    expect(within(morning).getByText("Schedule")).toBeInTheDocument();
    expect(within(morning).getByText("Enabled")).toBeInTheDocument();

    const cold = screen.getByRole("row", { name: /Cold alarm/ });
    expect(within(cold).getByText("Attribute change")).toBeInTheDocument();
    expect(within(cold).getByText("Disabled")).toBeInTheDocument();
  });
});
