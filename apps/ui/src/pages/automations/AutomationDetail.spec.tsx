import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import type { Automation, AutomationExecution } from "@/api/automations";

const { mockUseQuery, mockDeleteAutomation, mockNavigate } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockDeleteAutomation: vi.fn().mockResolvedValue(undefined),
  mockNavigate: vi.fn(),
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
  getAutomation: vi.fn(),
  listExecutions: vi.fn(),
  enableAutomation: vi.fn(),
  disableAutomation: vi.fn(),
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
        "deleteConfirm.title": "Delete automation",
        enabledBadge: "Enabled",
        disabledBadge: "Disabled",
        "common.dangerZone": "Danger zone",
        "common.dangerZoneDescription": "Irreversible.",
        "common.cancel": "Cancel",
        "common.delete": "Delete",
        "toasts.deleted": "Deleted",
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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AutomationDetail from "./AutomationDetail";

const automation: Automation = {
  id: "a1",
  name: "Morning warmup",
  enabled: true,
  actionTemplateId: "tpl-9f12",
  trigger: { type: "schedule", cron: "0 6 * * *" },
};

const execution: AutomationExecution = {
  id: "ex1",
  automationId: "a1",
  triggeredAt: "2026-04-25T06:00:00Z",
  executedAt: null,
  status: "failed",
  error: "Timeout",
  outputId: null,
};

function setQueryResults(executions: AutomationExecution[] = []) {
  mockUseQuery.mockImplementation((opts: { queryKey: readonly unknown[] }) => {
    if (opts.queryKey[2] === "executions") {
      return { data: executions, isLoading: false };
    }
    return { data: automation, isLoading: false };
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
  mockDeleteAutomation.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
});

describe("AutomationDetail", () => {
  it("renders the automation fields and an executions row with status badge", () => {
    setQueryResults([execution]);
    renderDetail();

    expect(
      screen.getByRole("heading", { name: "Morning warmup" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("tpl-9f12")).toBeInTheDocument();

    const row = screen.getAllByRole("row").at(-1)!;
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(within(row).getByText("Timeout")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("hides write actions without automations:write permission", () => {
    canPermission = (perm) => perm === "automations:read";
    setQueryResults();
    renderDetail();

    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Danger zone")).not.toBeInTheDocument();
  });

  it("deletes and navigates back to /automations after confirming", async () => {
    setQueryResults();
    renderDetail();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const buttons = screen.getAllByRole("button", { name: "Delete" });
    await userEvent.click(buttons[buttons.length - 1]);

    expect(mockDeleteAutomation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/automations");
  });
});
