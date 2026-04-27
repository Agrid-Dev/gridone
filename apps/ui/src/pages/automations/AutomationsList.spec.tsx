import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Automation } from "@/api/automations";

const { mockUseQuery, mockEnableAutomation, mockDisableAutomation, mockToast } =
  vi.hoisted(() => ({
    mockUseQuery: vi.fn(),
    mockEnableAutomation: vi.fn().mockResolvedValue({}),
    mockDisableAutomation: vi.fn().mockResolvedValue({}),
    mockToast: { success: vi.fn(), error: vi.fn() },
  }));

let canPermission: (perm: string) => boolean = () => true;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useMutation: (opts: {
    mutationFn: (...args: unknown[]) => Promise<unknown>;
  }) => ({
    mutate: opts.mutationFn,
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
  }),
}));

vi.mock("@/api/automations", () => ({
  listAutomations: vi.fn(),
  enableAutomation: (id: string) => mockEnableAutomation(id),
  disableAutomation: (id: string) => mockDisableAutomation(id),
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
  usePermissions: () => (perm: string) => canPermission(perm),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

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
  canPermission = () => true;
  mockUseQuery.mockReturnValue({ data: [], isLoading: false });
});

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockEnableAutomation.mockReset().mockResolvedValue({});
  mockDisableAutomation.mockReset().mockResolvedValue({});
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

describe("AutomationsList", () => {
  it("renders skeleton while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderList();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders ResourceEmpty when no automations exist", () => {
    mockUseQuery.mockReturnValue({ data: [], isLoading: false });
    renderList();
    expect(screen.getByText(/No automation yet/i)).toBeInTheDocument();
  });

  it("renders a row per automation with name, trigger label, and status", () => {
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

  it("hides toggle column and create button without write permission", () => {
    canPermission = (perm) => perm === "automations:read";
    mockUseQuery.mockReturnValue({
      data: [makeAutomation("a1", "Morning warmup", "schedule", true)],
      isLoading: false,
    });
    renderList();

    expect(
      screen.queryByRole("link", { name: /New automation/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Disable/i }),
    ).not.toBeInTheDocument();
  });

  it("calls disableAutomation when toggling an enabled automation", async () => {
    mockUseQuery.mockReturnValue({
      data: [makeAutomation("a1", "Morning warmup", "schedule", true)],
      isLoading: false,
    });
    renderList();

    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(mockDisableAutomation).toHaveBeenCalledWith("a1");
    expect(mockEnableAutomation).not.toHaveBeenCalled();
  });

  it("calls enableAutomation when toggling a disabled automation", async () => {
    mockUseQuery.mockReturnValue({
      data: [makeAutomation("a1", "Cold alarm", "change_event", false)],
      isLoading: false,
    });
    renderList();

    await userEvent.click(screen.getByRole("button", { name: "Enable" }));
    expect(mockEnableAutomation).toHaveBeenCalledWith("a1");
    expect(mockDisableAutomation).not.toHaveBeenCalled();
  });
});
