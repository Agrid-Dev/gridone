import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useGroupedDispatch, type CommandPreview } from "./useGroupedDispatch";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  dispatch: vi.fn(),
  listCommands: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      commandTemplates: { create: mocks.create, dispatch: mocks.dispatch },
      listCommands: mocks.listCommands,
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useGroupedDispatch(), { wrapper });
  const preview: CommandPreview = {
    devices: [],
    target: { ids: ["1", "2"] },
    write: { attribute: "setpoint", value: 21, data_type: "float" },
    label: "Setpoint",
    scope: "Building",
  };
  await act(async () => {
    await result.current.dispatch(preview);
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
