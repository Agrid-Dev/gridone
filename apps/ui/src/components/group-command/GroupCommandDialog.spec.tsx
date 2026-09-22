import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { GridoneError } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { GroupCommandDialog } from "./GroupCommandDialog";
import { useGroupCommand } from "./useGroupCommand";

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  confirm: vi.fn(),
  listCommands: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      previewCommand: api.preview,
      confirmCommand: api.confirm,
      listCommands: api.listCommands,
      list: api.list,
    },
  }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "groups.apply": "Apply to {{count}}",
    "groups.previewTitle": "Preview {{name}}",
    "groups.previewDescription": "Set {{attribute}} to {{value}}",
    "groups.cancel": "Cancel",
    "groups.close": "Close results",
    "groups.sending": "Sending setpoints…",
    "groups.resultsTitle": "Command results",
    "groups.batchSummary":
      "{{success}} succeeded, {{failed}} failed, {{pending}} pending",
    "commands.statusLabels.pending": "Pending",
    "commands.statusLabels.success": "Succeeded",
    "commands.statusLabels.error": "Failed",
    "commands.failure.unreachable": "Device unreachable",
    "groups.history": "View command history",
    "groups.applyWrites": "Apply {{count}} setpoints",
    "groups.writeAccepted": "Sent {{attribute}} to {{value}}",
    "groups.previewManyTitle": "Review setpoints",
    "groups.sentToTarget": "Command sent to {{name}}",
    "groups.members": "Member",
    "groups.before": "Before",
    "groups.after": "After",
  }),
);
const member = (id: string, eligible = true) => ({
  device_id: id,
  name: id,
  current_value: 20,
  eligible,
  reasons: eligible
    ? []
    : [
        {
          code: "constraints",
          message: { default: "Outside the allowed limits" },
        },
      ],
});
const preview = (
  members = [member("a"), member("b"), member("blocked", false)],
  token = "token",
) => ({
  token,
  target: { tags: { ecs: ["east"] }, driver_id: "driver" },
  attribute: "setpoint",
  value: 24,
  members,
});
function Harness({
  filtered = false,
  targetName,
}: {
  filtered?: boolean;
  targetName?: string;
}) {
  const command = useGroupCommand({
    tags: { ecs: ["east"] },
    driver_id: "driver",
  });
  return (
    <>
      <button
        onClick={() =>
          void command.prepare(
            "setpoint",
            24,
            filtered
              ? {
                  tags: { ecs: ["east"] },
                  driver_id: "driver",
                  types: ["thermostat"],
                }
              : undefined,
          )
        }
      >
        Prepare
      </button>
      <button
        onClick={() =>
          void command.prepareMany([
            { attribute: "setpoint", value: 24 },
            { attribute: "power", value: true },
          ])
        }
      >
        Prepare many
      </button>
      <GroupCommandDialog command={command} targetName={targetName} />
      <output>{command.batch?.batch_id}</output>
    </>
  );
}
function setup(filtered = false, targetName?: string) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <Harness filtered={filtered} targetName={targetName} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return cache;
}
beforeEach(() => {
  vi.clearAllMocks();
  api.preview.mockResolvedValue(preview());
  api.confirm.mockResolvedValue({ batch_id: "sent", commands: [] });
  api.listCommands.mockResolvedValue({ items: [], total_pages: 1 });
});
afterEach(cleanup);

describe("manual group confirmation", () => {
  it("shows each localized consequence and accepts all selected actions once", async () => {
    api.preview.mockResolvedValue({
      ...preview(),
      members: [
        {
          ...member("a"),
          user_confirmation: {
            default: "Disconnects",
            translations: { fr: "Coupe la communication" },
          },
        },
        {
          ...member("b"),
          user_confirmation: { default: "Restarts the device" },
          current_value: null,
          current_value_known: true,
        },
      ],
    });
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    expect(
      await screen.findByText("Coupe la communication"),
    ).toBeInTheDocument();
    expect(screen.getByText("Restarts the device")).toBeInTheDocument();
    expect(api.confirm).not.toHaveBeenCalled();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Apply to 2" }));
    await waitFor(() =>
      expect(api.confirm).toHaveBeenCalledExactlyOnceWith({
        token: "token",
        device_ids: ["a", "b"],
        confirmation_language: "fr",
      }),
    );
  });

  it("keeps live recipient outcomes visible until the user closes the dialog", async () => {
    const commands = ["a", "b"].map((device_id, index) => ({
      id: index + 1,
      batch_id: "sent",
      device_id,
      attribute: "setpoint",
      value: 24,
      data_type: "float",
      status: "pending",
    }));
    api.confirm.mockResolvedValue({ batch_id: "sent", commands });
    api.listCommands
      .mockResolvedValueOnce({ items: commands, total_pages: 1 })
      .mockResolvedValue({
        items: [
          { ...commands[0], status: "success" },
          { ...commands[1], status: "error", status_details: "unreachable" },
        ],
        total_pages: 1,
      });
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    fireEvent.click(await screen.findByRole("button", { name: "Apply to 2" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(
      await dialog.findByRole("heading", { name: "Command results" }),
    ).toBeVisible();
    expect(
      await dialog.findByText("0 succeeded, 0 failed, 2 pending"),
    ).toBeVisible();
    expect(dialog.getAllByText("Pending")).toHaveLength(2);
    expect(
      dialog.queryByRole("button", { name: /Apply/ }),
    ).not.toBeInTheDocument();
    await waitFor(
      () =>
        expect(
          dialog.getByText("1 succeeded, 1 failed, 0 pending"),
        ).toBeVisible(),
      { timeout: 2500 },
    );
    expect(dialog.getByText("Succeeded")).toBeVisible();
    expect(dialog.getByText(/Device unreachable/)).toBeVisible();
    expect(dialog.getAllByText("setpoint → 24")).toHaveLength(2);
    expect(
      dialog.getByRole("link", { name: "View command history" }),
    ).toHaveAttribute("href", "/devices/commands?batch_id=sent");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(api.confirm).toHaveBeenCalledTimes(1);
    fireEvent.click(dialog.getByRole("button", { name: "Close results" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows independent recipients in one dialog and identifies accepted setpoints after a partial failure", async () => {
    api.preview.mockImplementation(async ({ attribute }) => ({
      ...preview([member("a"), member("b")], attribute),
      attribute,
      value: attribute === "power" ? true : 24,
    }));
    api.confirm
      .mockResolvedValueOnce({ batch_id: "setpoint-sent", commands: [] })
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({ batch_id: "power-sent", commands: [] });
    setup();
    fireEvent.click(screen.getByText("Prepare many"));
    const apply = await screen.findByRole("button", {
      name: "Apply 2 setpoints",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const setpoint = within(screen.getByRole("region", { name: "setpoint" }));
    const power = within(screen.getByRole("region", { name: "power" }));
    fireEvent.click(setpoint.getByRole("checkbox", { name: "b" }));
    fireEvent.click(power.getByRole("checkbox", { name: "a" }));
    fireEvent.click(apply);
    await screen.findByText("Sent setpoint to 24");
    expect(api.confirm.mock.calls.map(([body]) => body)).toEqual([
      { token: "setpoint", device_ids: ["a"] },
      { token: "power", device_ids: ["b"] },
    ]);
    expect(setpoint.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply 1 setpoints" }));
    await screen.findByText("power-sent");
    expect(api.confirm).toHaveBeenLastCalledWith({
      token: "power",
      device_ids: ["b"],
    });
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close results" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("previews without sending, excludes members for one send, and disables ineligible members", async () => {
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    expect(api.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "blocked" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "b" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1" }));
    await screen.findByText("sent");
    expect(api.confirm).toHaveBeenCalledWith({
      token: "token",
      device_ids: ["a"],
    });
    fireEvent.click(screen.getByRole("button", { name: "Close results" }));
    fireEvent.click(screen.getByText("Prepare"));
    expect(
      await screen.findByRole("button", { name: "Apply to 2" }),
    ).toBeEnabled();
  });
  it("sends dynamic filters for the server to resolve on each preparation", async () => {
    setup(true);
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    expect(api.preview).toHaveBeenLastCalledWith({
      attribute: "setpoint",
      value: 24,
      target: {
        tags: { ecs: ["east"] },
        driver_id: "driver",
        types: ["thermostat"],
      },
    });
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    expect(api.preview).toHaveBeenLastCalledWith({
      attribute: "setpoint",
      value: 24,
      target: {
        tags: { ecs: ["east"] },
        driver_id: "driver",
        types: ["thermostat"],
      },
    });
    expect(api.list).not.toHaveBeenCalled();
    expect(api.confirm).not.toHaveBeenCalled();
  });
  it("leaves unknown operating rules unchecked and acknowledges only selected warnings", async () => {
    api.preview.mockResolvedValue({
      ...preview(),
      members: [
        {
          ...member("unknown", false),
          consent_required: true,
          reasons: [{ code: "operating_rule_unknown" }],
        },
      ],
    });
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    const checkbox = screen.getByRole("checkbox", { name: "unknown" });
    expect(checkbox).toBeEnabled();
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Apply to 0" })).toBeDisabled();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1" }));
    await screen.findByText("sent");
    expect(api.confirm).toHaveBeenCalledWith({
      token: "token",
      device_ids: ["unknown"],
      acknowledge_unknown_operating_rules: true,
    });
  });
  it("cancels with no writes and refuses an empty selection", async () => {
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox", { name: "a" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "b" }));
    expect(screen.getByRole("button", { name: "Apply to 0" })).toBeDisabled();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.confirm).not.toHaveBeenCalled();
  });
  it("requires another confirmation after changed membership and leaves new members unchecked", async () => {
    api.confirm.mockRejectedValueOnce(
      new GridoneError(409, {
        code: "command_preview_changed",
        resources: [],
      }),
    );
    api.preview
      .mockResolvedValueOnce(preview())
      .mockResolvedValueOnce(preview([member("a"), member("new")], "fresh"));
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    fireEvent.click(await screen.findByRole("button", { name: "Apply to 2" }));
    await screen.findByText("groups.previewChanged");
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "new" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1" }));
    await screen.findByText("sent");
    expect(api.confirm).toHaveBeenLastCalledWith({
      token: "fresh",
      device_ids: ["a"],
    });
  });
  it("prevents duplicate sends while the first confirmation is pending", async () => {
    let finish: (value: { batch_id: string; commands: [] }) => void = () => {};
    api.confirm.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    const button = await screen.findByRole("button", { name: "Apply to 2" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Sending setpoints…");
    await act(async () => finish({ batch_id: "sent", commands: [] }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Close results" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close results" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("what the user reads about the target", () => {
  it("names the group and never shows the tag that resolves it", async () => {
    setup(false, "Chambres étage 2");
    fireEvent.click(screen.getByText("Prepare"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByRole("heading", { name: "Preview Chambres étage 2" }),
    ).toBeVisible();
    expect(screen.queryByText(/ecs:east/)).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Apply to 2" }));
    expect(
      await dialog.findByText("Command sent to Chambres étage 2"),
    ).toBeVisible();
    expect(screen.queryByText(/ecs:east/)).not.toBeInTheDocument();
  });

  it("falls back to a neutral title rather than the tag when no name is given", async () => {
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getByRole("heading", { name: "Review setpoints" }),
    ).toBeVisible();
    expect(screen.queryByText(/ecs:east/)).not.toBeInTheDocument();
    expect(screen.queryByText(/east/)).not.toBeInTheDocument();
  });

  it("drops the eligibility and limits columns and says why a member is excluded", async () => {
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      dialog.getAllByRole("columnheader").map((c) => c.textContent),
    ).toEqual(["", "Member", "Before", "After"]);
    const blocked = dialog.getByRole("checkbox", { name: "blocked" });
    expect(blocked).toBeDisabled();
    const row = blocked.closest("tr")!;
    expect(row).toHaveAttribute("data-eligible", "false");
    expect(within(row).getByText("Outside the allowed limits")).toBeVisible();
    expect(within(row).queryByText("24")).not.toBeInTheDocument();
    const eligible = dialog.getByRole("checkbox", { name: "a" }).closest("tr")!;
    expect(within(eligible).getByText("24")).toBeVisible();
    expect(
      within(eligible).queryByText("Outside the allowed limits"),
    ).not.toBeInTheDocument();
  });
});
