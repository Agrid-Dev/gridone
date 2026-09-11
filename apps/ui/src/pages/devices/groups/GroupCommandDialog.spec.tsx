import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
    devices: { groups: api, listCommands: api.listCommands, list: api.list },
  }),
}));
vi.mock("react-i18next", () =>
  createI18nMock({
    "groups.apply": "Apply to {{count}}",
    "groups.previewTitle": "Preview {{name}}",
    "groups.previewDescription": "Set {{attribute}} to {{value}}",
    "groups.cancel": "Cancel",
  }),
);
const member = (id: string, eligible = true) => ({
  device_id: id,
  name: id,
  current_value: 20,
  eligible,
  reason: eligible ? null : "constraints",
});
const preview = (
  members = [member("a"), member("b"), member("blocked", false)],
  token = "token",
) => ({
  token,
  group_id: "group",
  group_name: "East",
  attribute: "setpoint",
  value: 24,
  members,
});
function Harness({ filtered = false }: { filtered?: boolean }) {
  const command = useGroupCommand("group");
  return (
    <>
      <button
        onClick={() =>
          void command.prepare(
            "setpoint",
            24,
            filtered ? { group_id: "group", types: ["thermostat"] } : undefined,
          )
        }
      >
        Prepare
      </button>
      <GroupCommandDialog command={command} />
      <output>{command.batch?.batch_id}</output>
    </>
  );
}
function setup(filtered = false) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <Harness filtered={filtered} />
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
  it("previews without sending, excludes members for one send, and disables ineligible members", async () => {
    setup();
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    expect(api.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "blocked" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "b" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1" }));
    await screen.findByText("sent");
    expect(api.confirm).toHaveBeenCalledWith("group", {
      token: "token",
      device_ids: ["a"],
    });
    fireEvent.click(screen.getByText("Prepare"));
    expect(
      await screen.findByRole("button", { name: "Apply to 2" }),
    ).toBeEnabled();
  });
  it("sends dynamic filters for the server to resolve on each preparation", async () => {
    setup(true);
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    expect(api.preview).toHaveBeenLastCalledWith("group", {
      attribute: "setpoint",
      value: 24,
      target: { group_id: "group", types: ["thermostat"] },
    });
    fireEvent.click(screen.getByText("Cancel"));
    fireEvent.click(screen.getByText("Prepare"));
    await screen.findByRole("dialog");
    expect(api.preview).toHaveBeenLastCalledWith("group", {
      attribute: "setpoint",
      value: 24,
      target: { group_id: "group", types: ["thermostat"] },
    });
    expect(api.list).not.toHaveBeenCalled();
    expect(api.confirm).not.toHaveBeenCalled();
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
        code: "group_preview_changed",
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
    expect(api.confirm).toHaveBeenLastCalledWith("group", {
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
    await act(async () => finish({ batch_id: "sent", commands: [] }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
