import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import type { Automation, AutomationExecution } from "@/api/automations";

const {
  mockUseQuery,
  mockGetAutomation,
  mockListExecutions,
  mockEnableAutomation,
  mockDisableAutomation,
  mockDeleteAutomation,
  mockNavigate,
  mockToast,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockGetAutomation: vi.fn(),
  mockListExecutions: vi.fn(),
  mockEnableAutomation: vi.fn().mockResolvedValue({}),
  mockDisableAutomation: vi.fn().mockResolvedValue({}),
  mockDeleteAutomation: vi.fn().mockResolvedValue(undefined),
  mockNavigate: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

let canPermission: (perm: string) => boolean = () => true;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useMutation: (opts: {
    mutationFn: (...args: unknown[]) => Promise<unknown>;
    onSuccess?: () => void;
  }) => ({
    mutate: async (...args: unknown[]) => {
      await opts.mutationFn(...args);
      opts.onSuccess?.();
    },
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
  }),
}));

vi.mock("@/api/automations", () => ({
  getAutomation: (id: string) => mockGetAutomation(id),
  listExecutions: (id: string) => mockListExecutions(id),
  enableAutomation: () => mockEnableAutomation(),
  disableAutomation: () => mockDisableAutomation(),
  deleteAutomation: () => mockDeleteAutomation(),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

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
        "fields.actionTemplate": "Command template",
        "actions.enable": "Enable",
        "actions.disable": "Disable",
        "actions.delete": "Delete",
        "executions.title": "Executions",
        "executions.triggeredAt": "Triggered at",
        "executions.executedAt": "Executed at",
        "executions.error": "Error",
        "executions.empty": "No executions yet",
        "executions.status.success": "Success",
        "executions.status.failed": "Failed",
        "triggers.schedule": "Schedule",
        "triggers.change_event": "Attribute change",
        "deleteConfirm.title": "Delete automation",
        enabledBadge: "Enabled",
        disabledBadge: "Disabled",
        "common.dangerZone": "Danger zone",
        "common.dangerZoneDescription": "Irreversible.",
        "common.cancel": "Cancel",
        "common.delete": "Delete",
        "toasts.deleted": "Deleted",
        "toasts.enabled": "Enabled",
        "toasts.disabled": "Disabled",
      };
      if (key === "deleteConfirm.details") {
        return `Delete "${opts?.name ?? ""}"?`;
      }
      if (map[key] !== undefined) return map[key];
      return opts?.defaultValue ?? key;
    },
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (perm: string) => canPermission(perm),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

import AutomationDetail from "./AutomationDetail";

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: "a1",
    name: "Morning warmup",
    enabled: true,
    actionTemplateId: "tpl-9f12",
    trigger: { type: "schedule", cron: "0 6 * * *" },
    ...overrides,
  };
}

function makeExecution(
  overrides: Partial<AutomationExecution> = {},
): AutomationExecution {
  return {
    id: "ex1",
    automationId: "a1",
    triggeredAt: "2026-04-25T06:00:00Z",
    executedAt: "2026-04-25T06:00:01Z",
    status: "success",
    error: null,
    outputId: null,
    ...overrides,
  };
}

function setQueryResults({
  automation,
  executions,
}: {
  automation?: Automation;
  executions?: AutomationExecution[];
}) {
  mockUseQuery.mockImplementation((opts: { queryKey: readonly unknown[] }) => {
    const key = opts.queryKey;
    if (key.length === 3 && key[2] === "executions") {
      return { data: executions ?? [], isLoading: false };
    }
    return {
      data: automation,
      isLoading: !automation,
    };
  });
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/automations/a1"]}>
      <Routes>
        <Route
          path="/automations/:automationId"
          element={<AutomationDetail />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  canPermission = () => true;
});

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockGetAutomation.mockReset();
  mockListExecutions.mockReset();
  mockEnableAutomation.mockReset().mockResolvedValue({});
  mockDisableAutomation.mockReset().mockResolvedValue({});
  mockDeleteAutomation.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
  mockToast.success.mockReset();
  mockToast.error.mockReset();
});

describe("AutomationDetail", () => {
  it("renders skeleton while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = renderDetail();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders the automation core fields and trigger label", () => {
    setQueryResults({
      automation: makeAutomation({ enabled: true }),
      executions: [],
    });
    renderDetail();
    expect(
      screen.getByRole("heading", { name: "Morning warmup" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("tpl-9f12")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  it("shows 'no executions' when the executions list is empty", () => {
    setQueryResults({
      automation: makeAutomation(),
      executions: [],
    });
    renderDetail();
    expect(screen.getByText("No executions yet")).toBeInTheDocument();
  });

  it("renders an executions row with status badge and dash for missing executedAt", () => {
    setQueryResults({
      automation: makeAutomation(),
      executions: [
        makeExecution({
          id: "ex1",
          status: "failed",
          executedAt: null,
          error: "Timeout",
        }),
      ],
    });
    renderDetail();
    const row = screen.getAllByRole("row").at(-1)!;
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(within(row).getByText("Timeout")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("hides enable/disable button and danger zone without write permission", () => {
    canPermission = (perm) => perm === "automations:read";
    setQueryResults({
      automation: makeAutomation({ enabled: true }),
      executions: [],
    });
    renderDetail();
    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
  });

  it("disables an enabled automation when the header button is clicked", async () => {
    setQueryResults({
      automation: makeAutomation({ enabled: true }),
      executions: [],
    });
    renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(mockDisableAutomation).toHaveBeenCalled();
  });

  it("deletes and navigates back to the list after confirming", async () => {
    setQueryResults({
      automation: makeAutomation(),
      executions: [],
    });
    renderDetail();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    // ConfirmButton renders a second "Delete" inside the alert dialog footer.
    const confirmButtons = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(mockDeleteAutomation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/automations");
  });
});
