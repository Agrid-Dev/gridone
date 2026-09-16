import type { ReactNode } from "react";
import type { Device } from "@gridone/sdk";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGroupedDispatch, type CommandPayload } from "./useGroupedDispatch";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  dispatch: vi.fn(),
  listCommands: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      commandTemplates: { create: mocks.create, dispatch: mocks.dispatch },
      listCommands: mocks.listCommands,
      previewCommand: mocks.preview,
      confirmCommand: mocks.confirm,
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const payload: CommandPayload = {
  target: { ids: ["1", "2"] },
  write: { attribute: "setpoint", value: 21, data_type: "float" },
};

function mountDispatch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useGroupedDispatch(), { wrapper });
}

it("polls every page of the batch until the remaining command completes", async () => {
  const pending = { id: 1, device_id: "1", status: "pending" };
  const failed = { id: 2, device_id: "2", status: "error" };
  mocks.create.mockResolvedValue({ id: "template" });
  mocks.dispatch.mockResolvedValue({
    batch_id: "batch",
    commands: [pending, failed],
  });
  let poll = 0;
  mocks.listCommands.mockImplementation(({ page }) => {
    if (page === 1) poll += 1;
    return Promise.resolve({
      items:
        page === 1
          ? [{ ...pending, status: poll === 1 ? "pending" : "success" }]
          : [failed],
      total_pages: 2,
    });
  });
  const { result } = mountDispatch();
  await act(async () => {
    await result.current.dispatch(payload, []);
  });
  await waitFor(() => expect(result.current.commandsByDevice.size).toBe(2));
  expect(result.current.commandsByDevice.get("2")?.status).toBe("error");
  await waitFor(
    () =>
      expect(result.current.commandsByDevice.get("1")?.status).toBe("success"),
    { timeout: 4000 },
  );
  expect(mocks.listCommands.mock.calls.map(([params]) => params)).toEqual([
    { batch_id: "batch", page: 1, size: 100 },
    { batch_id: "batch", page: 2, size: 100 },
    { batch_id: "batch", page: 1, size: 100 },
    { batch_id: "batch", page: 2, size: 100 },
  ]);
});

it("stops polling a batch the server reported as empty", async () => {
  mocks.create.mockResolvedValue({ id: "template" });
  mocks.dispatch.mockResolvedValue({ batch_id: "batch", commands: [] });
  mocks.listCommands.mockResolvedValue({ items: [], total_pages: 1 });
  const { result } = mountDispatch();
  await act(async () => {
    await result.current.dispatch(payload, []);
  });
  expect(result.current.snapshot?.empty).toBe(true);
  // An empty batch has nothing left to report: one listing, then silence.
  await waitFor(() => expect(mocks.listCommands).toHaveBeenCalled());
  const calls = mocks.listCommands.mock.calls.length;
  await new Promise((resolve) => setTimeout(resolve, 2500));
  expect(mocks.listCommands.mock.calls.length).toBe(calls);
});

const tagPayload: CommandPayload = {
  target: { tags: { asset_id: ["building"] } },
  write: { attribute: "setpoint", value: 21, data_type: "float" },
};
const reviewedDevices: Device[] = ["1", "2"].map((id) => ({
  id,
  name: id,
  driver_id: "driver",
  transport_id: "transport",
  config: {},
}));

it("dispatches a tag target from a confirmed preview of its eligible members", async () => {
  const success = { id: 1, device_id: "1", status: "success" };
  mocks.preview.mockResolvedValue({
    token: "token",
    members: [
      { device_id: "1", name: "One", current_value: 20, eligible: true },
      {
        device_id: "2",
        name: "Two",
        current_value: null,
        eligible: false,
        reasons: [{ code: "not_writable" }],
      },
      {
        device_id: "new",
        name: "New member",
        current_value: 20,
        eligible: true,
      },
    ],
  });
  mocks.confirm.mockResolvedValue({ batch_id: "batch", commands: [success] });
  mocks.listCommands.mockResolvedValue({ items: [success], total_pages: 1 });
  const { result } = mountDispatch();
  await act(async () => {
    await result.current.dispatch(tagPayload, reviewedDevices);
  });
  expect(mocks.preview).toHaveBeenCalledWith({
    attribute: "setpoint",
    value: 21,
    target: tagPayload.target,
    device_ids: ["1", "2"],
  });
  expect(mocks.confirm).toHaveBeenCalledWith({
    token: "token",
    device_ids: ["1"],
  });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(result.current.snapshot?.result?.batch_id).toBe("batch");
  await waitFor(() =>
    expect(result.current.commandsByDevice.get("1")?.status).toBe("success"),
  );
});

it("reports an empty batch when no previewed member is eligible", async () => {
  mocks.preview.mockResolvedValue({
    token: "token",
    members: [
      {
        device_id: "1",
        name: "One",
        current_value: null,
        eligible: false,
        reasons: [{ code: "not_writable" }],
      },
    ],
  });
  const { result } = mountDispatch();
  await act(async () => {
    await result.current.dispatch(tagPayload, reviewedDevices);
  });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(result.current.snapshot?.empty).toBe(true);
  expect(result.current.snapshot?.result).toBeUndefined();
  expect(mocks.listCommands).not.toHaveBeenCalled();
});
