import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GridoneError, type UnitCommand } from "@gridone/sdk";
import { useGroupCommand, type GroupCommandWrite } from "./useGroupCommand";

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      previewCommand: api.preview,
      confirmCommand: api.confirm,
      listCommands: api.list,
    },
  }),
}));
const target = { driver_id: "driver", tags: { group: ["comfort"] } };
const writes: GroupCommandWrite[] = [
  { attribute: "setpoint", value: 24 },
  { attribute: "power", value: true },
];
const preview = (attribute: string, token = attribute, ids = ["a", "b"]) => ({
  token,
  target,
  attribute,
  value: attribute === "power" ? true : 24,
  members: ids.map((id) => ({
    device_id: id,
    name: id,
    current_value: 20,
    eligible: true,
  })),
});
const batch = (attribute: string, commands: UnitCommand[] = []) => ({
  batch_id: attribute,
  commands,
});
const unit = (
  id: number,
  attribute: string,
  status: UnitCommand["status"] = "pending",
): UnitCommand => ({
  id,
  batch_id: attribute,
  template_id: null,
  device_id: String(id),
  attribute,
  value: attribute === "power" ? true : 24,
  data_type: attribute === "power" ? "bool" : "float",
  status,
  status_details: null,
  user_id: "user",
  created_at: "2026-09-15T00:00:00Z",
  executed_at: null,
  completed_at: null,
});
function setup() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useGroupCommand(target), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  api.preview.mockImplementation(async ({ attribute }) => preview(attribute));
  api.confirm.mockImplementation(async ({ token }) => batch(token));
  api.list.mockResolvedValue({ items: [], total_pages: 1 });
});
afterEach(cleanup);

async function prepare(result: ReturnType<typeof setup>["result"]) {
  await act(async () => {
    await result.current.prepareMany(writes);
  });
}
async function confirm(result: ReturnType<typeof setup>["result"]) {
  await act(async () => {
    await result.current.confirm();
  });
}

describe("several group setpoints", () => {
  it("reuses the original token and recipients when an uncertain send is reopened", async () => {
    api.confirm
      .mockResolvedValueOnce(batch("setpoint"))
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce(batch("power"));
    const { result } = setup();
    await prepare(result);
    act(() => result.current.setSelected(["a"], "power"));
    await confirm(result);
    act(() => result.current.setSelected(["b"], "power"));
    expect(result.current.preparations[1].selected).toEqual(["a"]);
    act(() => result.current.cancel());
    await act(async () => {
      await result.current.prepareMany([writes[1]], {
        tags: { group: ["comfort"] },
        driver_id: "driver",
      });
    });
    expect(api.preview).toHaveBeenCalledTimes(2);
    expect(result.current.preparations[0]).toMatchObject({
      uncertain: true,
      selected: ["a"],
      preview: { token: "power" },
    });
    await confirm(result);
    expect(api.confirm.mock.calls.map(([body]) => body)).toEqual([
      { token: "setpoint", device_ids: ["a", "b"] },
      { token: "power", device_ids: ["a"] },
      { token: "power", device_ids: ["a"] },
    ]);
  });

  it.each(["command_preview_changed", "command_preview_expired"])(
    "does not create another write after an uncertain token becomes %s",
    async (code) => {
      api.confirm
        .mockRejectedValueOnce(new Error("Response lost"))
        .mockRejectedValueOnce(new GridoneError(409, { code }));
      const { result } = setup();
      await act(async () => {
        await result.current.prepare("power", true);
      });
      await confirm(result);
      await confirm(result);
      await act(async () => {
        await result.current.retryPreview("power");
      });
      await confirm(result);
      expect(api.preview).toHaveBeenCalledTimes(1);
      expect(api.confirm).toHaveBeenCalledTimes(2);
      act(() => result.current.cancel());
      await act(async () => {
        await result.current.prepare("power", true);
      });
      await confirm(result);
      expect(api.preview).toHaveBeenCalledTimes(1);
      expect(api.confirm).toHaveBeenCalledTimes(2);
      await act(async () => {
        await result.current.prepare("power", false);
      });
      expect(api.preview).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps recipient selections independent and skips unselected setpoints", async () => {
    const { result } = setup();
    await prepare(result);
    expect(api.confirm).not.toHaveBeenCalled();
    act(() => result.current.setSelected([], "power"));
    expect(result.current.preparations[0].selected).toEqual(["a", "b"]);
    await confirm(result);
    expect(api.confirm).toHaveBeenCalledExactlyOnceWith({
      token: "setpoint",
      device_ids: ["a", "b"],
    });
    expect(result.current.successfulWrites).toEqual([writes[0]]);
    expect(result.current.preview).toBeNull();
  });

  it("never resends accepted setpoints when retrying a partial network failure", async () => {
    let attempts = 0;
    api.confirm.mockImplementation(async ({ token }) => {
      if (token === "power" && attempts++ === 0)
        throw new Error("Connection lost");
      return batch(token);
    });
    const { result } = setup();
    await prepare(result);
    await confirm(result);
    expect(result.current.successfulWrites).toEqual([writes[0]]);
    expect(result.current.preview).not.toBeNull();
    expect(result.current.preparations[1].error).toBeInstanceOf(Error);
    await confirm(result);
    expect(api.confirm.mock.calls.map(([body]) => body.token)).toEqual([
      "setpoint",
      "power",
      "power",
    ]);
    expect(result.current.batches.map((item) => item.batch_id)).toEqual([
      "setpoint",
      "power",
    ]);
    expect(result.current.successfulWrites).toEqual(writes);
    expect(result.current.preview).toBeNull();
  });

  it("retains accepted writes after cancellation and clears them only for a new preparation", async () => {
    api.confirm
      .mockResolvedValueOnce(batch("setpoint"))
      .mockRejectedValueOnce(new Error("Unavailable"));
    const { result } = setup();
    await prepare(result);
    await confirm(result);
    act(() => result.current.cancel());
    await confirm(result);
    expect(api.confirm).toHaveBeenCalledTimes(2);
    expect(result.current.successfulWrites).toEqual([writes[0]]);
    await act(async () => {
      await result.current.prepareMany([writes[1]]);
    });
    expect(result.current.successfulWrites).toEqual([]);
    expect(result.current.batches).toEqual([]);
    expect(result.current.commands).toEqual([]);
  });

  it("refreshes only a conflicted setpoint, keeps new members unchecked and requires another confirmation", async () => {
    api.confirm
      .mockResolvedValueOnce(batch("setpoint"))
      .mockRejectedValueOnce(
        new GridoneError(409, { code: "command_preview_changed" }),
      );
    const { result } = setup();
    await prepare(result);
    api.preview.mockResolvedValueOnce(preview("power", "fresh", ["a", "new"]));
    await confirm(result);
    expect(api.preview).toHaveBeenCalledTimes(3);
    expect(result.current.preparations[1]).toMatchObject({
      selected: ["a"],
      changed: true,
      preview: { token: "fresh" },
    });
    expect(result.current.successfulWrites).toEqual([writes[0]]);
    expect(api.confirm).toHaveBeenCalledTimes(2);
    await confirm(result);
    expect(api.confirm).toHaveBeenLastCalledWith({
      token: "fresh",
      device_ids: ["a"],
    });
    expect(
      api.confirm.mock.calls.filter(([body]) => body.token === "setpoint"),
    ).toHaveLength(1);
  });

  it("does not reuse a consumed preview if refreshing fails", async () => {
    api.confirm.mockRejectedValueOnce(
      new GridoneError(409, { code: "command_preview_expired" }),
    );
    const { result } = setup();
    await act(async () => {
      await result.current.prepare("power", true);
    });
    api.preview.mockRejectedValueOnce(new Error("Preview unavailable"));
    await confirm(result);
    expect(result.current.preparations[0].needsRefresh).toBe(true);
    await confirm(result);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    api.preview.mockResolvedValueOnce(preview("power", "fresh"));
    await act(async () => {
      await result.current.retryPreview("power");
    });
    expect(api.confirm).toHaveBeenCalledTimes(1);
    await confirm(result);
    expect(api.confirm).toHaveBeenLastCalledWith({
      token: "fresh",
      device_ids: ["a", "b"],
    });
  });

  it("keeps a failed initial preview reviewable alongside accepted setpoints", async () => {
    api.preview
      .mockResolvedValueOnce(preview("setpoint"))
      .mockRejectedValueOnce(new Error("Unavailable"));
    const { result } = setup();
    await prepare(result);
    await confirm(result);
    expect(result.current.preview).not.toBeNull();
    expect(result.current.successfulWrites).toEqual([writes[0]]);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.retryPreview("power");
    });
    expect(result.current.preparations[1].selected).toEqual(["a", "b"]);
    await confirm(result);
    expect(result.current.successfulWrites).toEqual(writes);
  });

  it("blocks repeated confirmation while several requests are pending", async () => {
    let finish: (value: ReturnType<typeof batch>) => void = () => {};
    api.confirm.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = setup();
    await prepare(result);
    let sending: Promise<void>;
    act(() => {
      sending = result.current.confirm();
    });
    await confirm(result);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish(batch("setpoint"));
      await sending;
    });
    expect(api.confirm.mock.calls.map(([body]) => body.token)).toEqual([
      "setpoint",
      "power",
    ]);
  });

  it("polls all pages of every accepted batch and keeps pending results after an empty listing", async () => {
    api.confirm.mockImplementation(async ({ token }) =>
      batch(token, [unit(token === "power" ? 3 : 1, token)]),
    );
    let setpointPolls = 0;
    api.list.mockImplementation(async ({ batch_id, page }) => {
      if (batch_id === "power")
        return { items: [unit(3, "power", "success")], total_pages: 1 };
      if (!page) setpointPolls += 1;
      if (setpointPolls === 1) return { items: [], total_pages: 1 };
      return {
        items: [
          unit(
            page === 2 ? 2 : 1,
            "setpoint",
            page === 2 ? "error" : "success",
          ),
        ],
        total_pages: 2,
      };
    });
    const { result } = setup();
    await prepare(result);
    await confirm(result);
    await waitFor(() =>
      expect(
        result.current.commands.find((item) => item.id === 3)?.status,
      ).toBe("success"),
    );
    expect(result.current.commands.find((item) => item.id === 1)?.status).toBe(
      "pending",
    );
    await waitFor(() => expect(result.current.commands).toHaveLength(3), {
      timeout: 2500,
    });
    expect(result.current.commands.map((item) => item.status)).toEqual([
      "success",
      "error",
      "success",
    ]);
    expect(api.list).toHaveBeenCalledWith({
      batch_id: "setpoint",
      size: 200,
      page: 2,
    });
  });

  it("keeps successful results visible if another accepted batch cannot be listed", async () => {
    api.confirm.mockImplementation(async ({ token }) =>
      batch(token, [unit(token === "power" ? 2 : 1, token)]),
    );
    api.list.mockImplementation(async ({ batch_id }) => {
      if (batch_id === "power") throw new Error("Listing unavailable");
      return { items: [unit(1, "setpoint", "success")], total_pages: 1 };
    });
    const { result } = setup();
    await prepare(result);
    await confirm(result);
    await waitFor(() =>
      expect(result.current.resultsError).toBeInstanceOf(Error),
    );
    expect(result.current.commands.map((item) => item.status)).toEqual([
      "success",
      "pending",
    ]);
  });
});
