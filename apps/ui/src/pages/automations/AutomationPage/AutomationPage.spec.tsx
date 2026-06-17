import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import type { Automation, AutomationExecution } from "@/api/automations";
import { createI18nMock } from "@/test/i18nMock";

const {
  mockUseQuery,
  mockDeleteAutomation,
  mockUpdateAutomation,
  mockNavigate,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockDeleteAutomation: vi.fn().mockResolvedValue(undefined),
  mockUpdateAutomation: vi.fn().mockResolvedValue(undefined),
  mockNavigate: vi.fn(),
}));

let canPermission: (perm: string) => boolean = () => true;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useSuspenseQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
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
  listTriggerSchemas: vi.fn(),
  enableAutomation: vi.fn(),
  disableAutomation: vi.fn(),
  deleteAutomation: () => mockDeleteAutomation(),
  updateAutomation: (id: string, payload: unknown) =>
    mockUpdateAutomation(id, payload),
}));

vi.mock("@/api/users", () => ({
  getUser: vi.fn().mockResolvedValue({ id: "user-01", username: "alice" }),
}));

vi.mock("@/api/commands", () => ({ getTemplate: vi.fn() }));
vi.mock("@/api/assets", () => ({
  getAssetTreeWithDevices: vi.fn(),
  flattenAssetTree: () => [],
  flattenAssetTreeById: () => ({}),
}));

vi.mock("@/pages/devices/commands/presenters/TargetPresenter", () => ({
  TargetPresenter: ({ target }: { target: { ids?: string[] } }) => (
    <div data-testid="target-presenter">target-ids={target.ids?.join(",")}</div>
  ),
}));

vi.mock("@/pages/devices/commands/presenters/WritePresenter", () => ({
  WritePresenter: ({ write }: { write: { attribute: string } }) => (
    <div data-testid="write-presenter">{write.attribute}</div>
  ),
}));

vi.mock("./presenters/TriggerPresenter", () => ({
  TriggerPresenter: ({ trigger }: { trigger: { providerId: string } }) => (
    <div data-testid="trigger-presenter">type={trigger.providerId}</div>
  ),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("react-i18next", () =>
  createI18nMock({
    title: "Automations",
    singular: "Automation",
    "flow.trigger": "Trigger",
    "flow.action": "Action",
    "actions.types.command_template": "Run a command",
    "fields.actionTemplate": "Command template",
    "fields.status": "Status",
    "fields.name": "Name",
    "fields.description": "Description",
    "automations:fields.name": "Name",
    "automations:fields.description": "Description",
    "metadata.title": "Automation",
    "metadata.edit": "Edit automation",
    "metadata.noDescription": "No description",
    "metadata.createdAt": "Created",
    "metadata.updatedAt": "Last edited",
    "metadata.createdBy": "Created by",
    "common.edit": "Edit",
    "actions.enable": "Enable",
    "actions.disable": "Disable",
    "actions.delete": "Delete",
    "executions.title": "Executions",
    "executions.timestamp": "Timestamp",
    "executions.viewBatch": "View command",
    "executions.empty": "No executions yet",
    "executions.status.success": "Success",
    "executions.status.failed": "Failed",
    "triggers.types.schedule": "Schedule",
    "deleteConfirm.title": "Delete automation",
    "deleteConfirm.details": 'Delete "{{name}}"?',
    enabledBadge: "Enabled",
    disabledBadge: "Disabled",
    "common.cancel": "Cancel",
    "common:common.cancel": "Cancel",
    "common.save": "Save",
    "common:common.save": "Save",
    "common.delete": "Delete",
    "toasts.deleted": "Deleted",
  }),
);

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => (perm: string) => canPermission(perm),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AutomationPage from "./AutomationPage";

const automation: Automation = {
  id: "a1",
  name: "Morning warmup",
  description: "Boost heating before occupants arrive",
  enabled: true,
  action: {
    providerId: "command_template",
    params: { templateId: "tpl-9f12" },
  },
  trigger: { providerId: "schedule", params: { cron: "0 6 * * *" } },
  createdAt: "2026-01-01T10:00:00Z",
  updatedAt: "2026-01-01T10:00:00Z",
  createdBy: "user-01",
};

const execution: AutomationExecution = {
  id: "ex1",
  automationId: "a1",
  triggeredAt: "2026-04-25T06:00:00Z",
  executedAt: "2026-04-25T06:00:01Z",
  status: "success",
  error: null,
  outputId: "batch-abc",
};

function setQueryResults(executions: AutomationExecution[] = []) {
  mockUseQuery.mockImplementation((opts: { queryKey: readonly unknown[] }) => {
    if (opts.queryKey[2] === "executions") {
      return { data: executions, isLoading: false };
    }
    if (opts.queryKey[0] === "command-templates") {
      return {
        data: {
          id: "tpl-9f12",
          name: "Boost",
          target: { ids: ["d1"] },
          write: {
            attribute: "temperature_setpoint",
            value: 22,
            dataType: "float",
          },
          createdAt: "2026-01-01T00:00:00Z",
          createdBy: "user1",
        },
        isLoading: false,
      };
    }
    if (opts.queryKey[0] === "assets") {
      return { data: [], isLoading: false };
    }
    if (opts.queryKey[0] === "users") {
      return { data: { id: "user-01", username: "alice" }, isLoading: false };
    }
    return { data: automation, isLoading: false };
  });
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/automations/a1"]}>
      <Routes>
        <Route path="/automations/:automationId" element={<AutomationPage />} />
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
  mockUpdateAutomation.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
});

describe("AutomationPage", () => {
  it("renders header, trigger card, action card with template name first, and execution row linking to the batch", () => {
    setQueryResults([execution]);
    renderDetail();

    expect(
      screen.getAllByRole("heading", { name: "Morning warmup" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Boost heating before occupants arrive"),
    ).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();

    expect(screen.getByText("Trigger")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByTestId("trigger-presenter")).toHaveTextContent(
      "type=schedule",
    );
    expect(screen.getByText("Run a command")).toBeInTheDocument();

    const templateLink = screen.getByRole("link", { name: /Boost/ });
    expect(templateLink).toHaveAttribute(
      "href",
      "/devices/commands/templates/tpl-9f12",
    );
    expect(screen.getByTestId("target-presenter")).toHaveTextContent(
      "target-ids=d1",
    );
    expect(screen.getByTestId("write-presenter")).toHaveTextContent(
      "temperature_setpoint",
    );

    const row = screen.getAllByRole("row").at(-1)!;
    const batchLink = within(row).getByRole("link", { name: /View command/ });
    expect(batchLink).toHaveAttribute(
      "href",
      "/devices/commands?batch_id=batch-abc",
    );
  });

  it("shows created date, creator username, and hides updated_at when equal to created_at", () => {
    setQueryResults();
    renderDetail();

    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
    expect(screen.queryByText(/Last edited/)).not.toBeInTheDocument();
  });

  it("shows updated_at when it differs from created_at", () => {
    mockUseQuery.mockImplementation(
      (opts: { queryKey: readonly unknown[] }) => {
        if (opts.queryKey[0] === "users") {
          return {
            data: { id: "user-01", username: "alice" },
            isLoading: false,
          };
        }
        if (opts.queryKey[0] === "assets")
          return { data: [], isLoading: false };
        if (opts.queryKey[0] === "command-templates") {
          return {
            data: {
              id: "tpl-9f12",
              name: "Boost",
              target: { ids: ["d1"] },
              write: {
                attribute: "temperature_setpoint",
                value: 22,
                dataType: "float",
              },
              createdAt: "2026-01-01T00:00:00Z",
              createdBy: "user1",
            },
            isLoading: false,
          };
        }
        if (opts.queryKey[2] === "executions")
          return { data: [], isLoading: false };
        return {
          data: {
            ...automation,
            updatedAt: "2026-03-01T12:00:00Z",
          },
          isLoading: false,
        };
      },
    );
    renderDetail();

    expect(screen.getByText(/Last edited/)).toBeInTheDocument();
  });

  it("renders error inline with the status badge in the same cell", () => {
    setQueryResults([
      {
        ...execution,
        id: "ex2",
        status: "failed",
        error: "Timeout waiting for device",
        outputId: null,
      },
    ]);
    renderDetail();

    const row = screen.getAllByRole("row").at(-1)!;
    expect(within(row).getByText("Failed")).toBeInTheDocument();
    expect(
      within(row).getByText("Timeout waiting for device"),
    ).toBeInTheDocument();
  });

  it("hides write actions without automations:write permission", () => {
    canPermission = (perm) => perm === "automations:read";
    setQueryResults();
    renderDetail();

    expect(
      screen.queryByRole("button", { name: "Disable" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("edits the metadata card with required title and optional description", async () => {
    setQueryResults();
    renderDetail();

    const editButton = screen.getByRole("button", { name: "Edit automation" });
    const metadataCard = editButton.closest("[aria-busy]") as HTMLElement;
    expect(metadataCard).not.toBeNull();
    expect(
      within(metadataCard).getByText("Boost heating before occupants arrive"),
    ).toBeInTheDocument();

    await userEvent.click(editButton);

    const nameInput = await within(metadataCard).findByLabelText(/Name/);
    const descriptionInput = within(metadataCard).getByLabelText(/Description/);

    await userEvent.clear(nameInput);
    expect(
      within(metadataCard).getByRole("button", { name: "Save" }),
    ).toBeDisabled();

    await userEvent.type(nameInput, "Boosted morning warmup");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Updated description");

    await userEvent.click(
      within(metadataCard).getByRole("button", { name: "Save" }),
    );

    expect(mockUpdateAutomation).toHaveBeenCalledWith("a1", {
      name: "Boosted morning warmup",
      description: "Updated description",
      enabled: true,
    });
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
