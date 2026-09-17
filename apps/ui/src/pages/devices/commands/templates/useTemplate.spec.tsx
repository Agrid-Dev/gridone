import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CommandTemplateResponse } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { useTemplate } from "./useTemplate";

const api = vi.hoisted(() => ({
  navigate: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  dispatch: vi.fn(),
  listCommands: vi.fn(),
}));
vi.mock("react-router", () => ({ useNavigate: () => api.navigate }));
vi.mock("react-i18next", () => createI18nMock({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => ({ assetsById: {} }),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      list: api.list,
      listCommands: api.listCommands,
      previewCommand: api.preview,
      confirmCommand: api.confirm,
      commandTemplates: { get: api.get, dispatch: api.dispatch },
    },
  }),
}));
function setup(target: CommandTemplateResponse["target"]) {
  const template: CommandTemplateResponse = {
    id: "template",
    name: "Morning",
    target,
    write: { attribute: "setpoint", value: 24, data_type: "float" },
    created_at: "2026-09-15T00:00:00Z",
    created_by: "user",
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  cache.setQueryData(["command-templates", "template"], template);
  api.get.mockResolvedValue(template);
  return renderHook(() => useTemplate("template"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockResolvedValue([]);
  api.listCommands.mockResolvedValue({ items: [], total_pages: 1 });
  api.preview.mockImplementation(async (request) => ({
    ...request,
    token: "preview",
    members: [
      { device_id: "a", name: "Room A", current_value: 22, eligible: true },
    ],
  }));
  api.confirm.mockResolvedValue({ batch_id: "sent", commands: [] });
  api.dispatch.mockResolvedValue({ batch_id: "sent", commands: [] });
});
afterEach(cleanup);

it("reviews a warning on an explicit-id template before any dispatch", async () => {
  api.preview.mockImplementation(async (request) => ({
    ...request,
    token: "warned",
    members: [
      {
        device_id: "a",
        name: "A",
        current_value: 20,
        eligible: true,
        user_confirmation: { default: "May disconnect" },
      },
    ],
  }));
  const { result } = setup({ ids: ["a"] });
  await act(async () => {
    await result.current.execute();
  });
  expect(api.dispatch).not.toHaveBeenCalled();
  expect(api.confirm).not.toHaveBeenCalled();
  expect(api.preview).toHaveBeenCalledTimes(1);
  expect(result.current.groupCommand.preview).not.toBeNull();
  await act(async () => {
    await result.current.groupCommand.confirm();
  });
  expect(api.confirm).toHaveBeenCalledExactlyOnceWith({
    token: "warned",
    device_ids: ["a"],
    confirmation_language: "fr",
  });
});

it("keeps a tag template's result dialog on the detail page until manually closed", async () => {
  const { result } = setup({ tags: { group: ["comfort"] } });
  await act(async () => {
    await result.current.execute();
  });
  await waitFor(() => expect(result.current.groupCommand.busy).toBe(false));
  await act(async () => {
    await result.current.groupCommand.confirm();
  });
  expect(result.current.groupCommand.batch?.batch_id).toBe("sent");
  expect(result.current.groupCommand.preview).not.toBeNull();
  expect(api.navigate).not.toHaveBeenCalled();
  act(() => result.current.groupCommand.cancel());
  expect(result.current.groupCommand.preview).toBeNull();
  expect(api.navigate).not.toHaveBeenCalled();
  expect(api.dispatch).not.toHaveBeenCalled();
});

it("preserves navigation to history for a directly dispatched template", async () => {
  const { result } = setup({ ids: ["a"] });
  await act(async () => {
    await result.current.execute();
  });
  await waitFor(() =>
    expect(api.navigate).toHaveBeenCalledWith(
      "/devices/commands?batch_id=sent",
    ),
  );
  expect(api.dispatch).toHaveBeenCalledWith("template");
  expect(api.preview).toHaveBeenCalledTimes(1);
});
