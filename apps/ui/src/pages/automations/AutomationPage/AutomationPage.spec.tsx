import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import type {
  Action,
  Automation,
  AutomationExecution,
  Trigger,
} from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const {
  mockUseQuery,
  mockDeleteAutomation,
  mockUpdateAutomation,
  mockDisableAutomation,
  mockNavigate,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockDeleteAutomation: vi.fn().mockResolvedValue(undefined),
  mockUpdateAutomation: vi.fn().mockResolvedValue(undefined),
  mockDisableAutomation: vi.fn().mockResolvedValue(undefined),
  mockNavigate: vi.fn(),
}));

let canPermission: (perm: string) => boolean = () => true;

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useSuspenseQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
  useMutation: (opts: {
    mutationFn: (...args: unknown[]) => Promise<unknown>;
    onSuccess?: (data: unknown, variables: unknown) => void;
  }) => ({
    mutate: async (...args: unknown[]) => {
      const data = await opts.mutationFn(...args);
      opts.onSuccess?.(data, args[0]);
    },
    isPending: false,
  }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    removeQueries: vi.fn(),
  }),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    automations: {
      get: vi.fn(),
      listExecutions: vi.fn(),
      getTriggerSchemas: vi.fn(),
      enable: vi.fn(),
      disable: () => mockDisableAutomation(),
      delete: () => mockDeleteAutomation(),
      update: (id: string, payload: unknown) =>
        mockUpdateAutomation(id, payload),
    },
    users: { get: vi.fn() },
    devices: { commandTemplates: { get: vi.fn() } },
    assets: { getTreeWithDevices: vi.fn() },
  }),
}));

vi.mock("@/lib/assets", () => ({
  flattenAssetTree: () => [],
  flattenAssetTreeById: () => ({}),
  flattenDeviceAssets: () => ({}),
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
  TriggerPresenter: ({ trigger }: { trigger: { provider_id: string } }) => (
    <div data-testid="trigger-presenter">type={trigger.provider_id}</div>
  ),
}));

const EDITED_TRIGGER: Trigger = {
  provider_id: "schedule",
  params: { cron: "0 7 * * *" },
};
const EDITED_ACTION: Action = {
  provider_id: "notification",
  params: { title: "Heads up", body: "", severity: "info", user_ids: ["u1"] },
};

/** The trigger and action bodies own their own react-hook-form state; the page
 *  only cares that it receives their drafts, so both are stubbed as a readout
 *  plus a button that reports an edited value. */
vi.mock("./form/TriggerForm", () => ({
  default: ({
    initialValue,
    onChange,
  }: {
    initialValue?: Trigger;
    onChange?: (trigger: Trigger | null) => void;
  }) => (
    <div data-testid="trigger-form">
      type={initialValue?.provider_id}
      <button type="button" onClick={() => onChange?.(EDITED_TRIGGER)}>
        edit trigger
      </button>
    </div>
  ),
}));

vi.mock("./form/ActionForm", () => ({
  default: ({
    initialValue,
    onChange,
  }: {
    initialValue?: Action;
    onChange?: (action: Action | null) => void;
  }) => (
    <div data-testid="action-form">
      type={initialValue?.provider_id}
      <button type="button" onClick={() => onChange?.(EDITED_ACTION)}>
        edit action
      </button>
    </div>
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
    "fields.name": "Name",
    "fields.description": "Description",
    "editPage.breadcrumbLabel": "Breadcrumb",
    "editPage.lastExecution": "Last run {{ago}}.",
    "editPage.neverExecuted": "Never run yet.",
    "editPage.unsavedChanges": "Unsaved changes",
    "editPage.saveChanges": "Save changes",
    "editPage.deleteHint": "The execution history is kept.",
    "editPage.identity.title": "Identity",
    "editPage.when.title": "When",
    "editPage.then.title": "Then",
    "metadata.createdAt": "Created",
    "metadata.updatedAt": "Last edited",
    "metadata.createdBy": "Created by",
    "stats.executions24h": "runs (24 h)",
    "recentExecutions.title": "Latest runs",
    "actions.enable": "Enable",
    "actions.disable": "Disable",
    "actions.delete": "Delete",
    "executions.title": "Executions",
    "executions.viewBatch": "View command",
    "executions.empty": "No executions yet",
    "executions.status.success": "Success",
    "executions.status.failed": "Failed",
    "deleteConfirm.title": "Delete automation",
    "deleteConfirm.details": 'Delete "{{name}}"?',
    enabledBadge: "Enabled",
    disabledBadge: "Disabled",
    "common.cancel": "Cancel",
    "common.saving": "Saving...",
    "common.delete": "Delete",
    "common.timeAgo.hours": "{{count}} hours ago",
    "common.timeAgo.days": "{{count}} days ago",
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
    provider_id: "command_template",
    params: { template_id: "tpl-9f12" },
  },
  trigger: { provider_id: "schedule", params: { cron: "0 6 * * *" } },
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
  created_by: "user-01",
};

const execution: AutomationExecution = {
  id: "ex1",
  automation_id: "a1",
  triggered_at: "2026-04-25T06:00:00Z",
  executed_at: "2026-04-25T06:00:01Z",
  status: "success",
  error: null,
  output_id: "batch-abc",
};

function setQueryResults(
  executions: AutomationExecution[] = [],
  overrides: Partial<Automation> = {},
) {
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
            data_type: "float",
          },
          created_at: "2026-01-01T00:00:00Z",
          created_by: "user1",
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
    return { data: { ...automation, ...overrides }, isLoading: false };
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
  mockDisableAutomation.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
});

describe("AutomationPage", () => {
  it("renders the header, the editable sections and the run log", () => {
    setQueryResults([execution]);
    renderDetail();

    expect(
      screen.getByRole("heading", { level: 1, name: "Morning warmup" }),
    ).toBeInTheDocument();
    // Status badge next to the title, and the toggle's own label.
    expect(screen.getAllByText("Enabled")).toHaveLength(2);
    expect(screen.getByText("runs (24 h)")).toBeInTheDocument();
    expect(screen.getByText(/^Last run .+ ago\.$/)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Automations" })).toHaveAttribute(
      "href",
      "/automations",
    );

    expect(screen.getByLabelText(/Name/)).toHaveValue("Morning warmup");
    expect(screen.getByLabelText(/Description/)).toHaveValue(
      "Boost heating before occupants arrive",
    );
    expect(screen.getByTestId("trigger-form")).toHaveTextContent(
      "type=schedule",
    );
    expect(screen.getByTestId("action-form")).toHaveTextContent(
      "type=command_template",
    );

    const runs = screen.getByRole("list", { name: "Executions" });
    expect(within(runs).getByText("Success")).toBeInTheDocument();
    expect(
      within(runs).getByRole("link", { name: /View command/ }),
    ).toHaveAttribute("href", "/devices/commands?batch_id=batch-abc");
  });

  it("shows created date, creator username, and hides updated_at when equal to created_at", () => {
    setQueryResults();
    renderDetail();

    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByText(/alice/)).toBeInTheDocument();
    expect(screen.queryByText(/Last edited/)).not.toBeInTheDocument();
  });

  it("shows updated_at when it differs from created_at", () => {
    setQueryResults([], { updated_at: "2026-03-01T12:00:00Z" });
    renderDetail();

    expect(screen.getByText(/Last edited/)).toBeInTheDocument();
  });

  it("saves identity, trigger and action in a single request", async () => {
    setQueryResults();
    renderDetail();

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    const nameInput = screen.getByLabelText(/Name/);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Boosted morning warmup");
    await userEvent.click(screen.getByRole("button", { name: "edit trigger" }));
    await userEvent.click(screen.getByRole("button", { name: "edit action" }));

    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(mockUpdateAutomation).toHaveBeenCalledTimes(1);
    expect(mockUpdateAutomation).toHaveBeenCalledWith("a1", {
      name: "Boosted morning warmup",
      description: "Boost heating before occupants arrive",
      trigger: EDITED_TRIGGER,
      action: EDITED_ACTION,
    });
  });

  it("keeps save disabled while the name is empty", async () => {
    setQueryResults();
    renderDetail();

    await userEvent.clear(screen.getByLabelText(/Name/));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockUpdateAutomation).not.toHaveBeenCalled();
  });

  it("drops pending edits on cancel", async () => {
    setQueryResults();
    renderDetail();

    await userEvent.type(screen.getByLabelText(/Name/), " tweaked");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByLabelText(/Name/)).toHaveValue("Morning warmup");
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("toggles the automation off from the header switch", async () => {
    setQueryResults();
    renderDetail();

    await userEvent.click(screen.getByRole("switch", { name: "Disable" }));

    expect(mockDisableAutomation).toHaveBeenCalled();
  });

  it("renders the error of a failed execution", () => {
    setQueryResults([
      {
        ...execution,
        id: "ex2",
        status: "failed",
        error: "Timeout waiting for device",
        output_id: null,
      },
    ]);
    renderDetail();

    const runs = screen.getByRole("list", { name: "Executions" });
    expect(within(runs).getByText("Failed")).toBeInTheDocument();
    expect(
      within(runs).getByText("Timeout waiting for device"),
    ).toBeInTheDocument();
  });

  it("falls back to read-only presenters without automations:write", () => {
    canPermission = (perm) => perm === "automations:read";
    setQueryResults();
    renderDetail();

    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("trigger-form")).not.toBeInTheDocument();
    expect(screen.getByTestId("trigger-presenter")).toHaveTextContent(
      "type=schedule",
    );
    expect(screen.getByTestId("target-presenter")).toHaveTextContent(
      "target-ids=d1",
    );
  });

  it("deletes and navigates back to /automations after confirming", async () => {
    setQueryResults();
    renderDetail();

    await userEvent.click(screen.getByRole("button", { name: /Delete/ }));
    const buttons = screen.getAllByRole("button", { name: /Delete/ });
    await userEvent.click(buttons[buttons.length - 1]);

    expect(mockDeleteAutomation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/automations");
  });
});
