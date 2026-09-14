import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { createI18nMock } from "@/test/i18nMock";
import { useTagEditor } from "./useTagEditor";
const api = vi.hoisted(() => ({
  list: vi.fn(),
  listTags: vi.fn(),
  bulkTags: vi.fn(),
  renameTag: vi.fn(),
}));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ devices: api }),
}));
vi.mock("react-i18next", () => createI18nMock({}));
afterEach(cleanup);
function setup() {
  api.list.mockResolvedValue([]);
  api.listTags.mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderHook(() => useTagEditor(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>
        <MemoryRouter initialEntries={["/devices/tags/edit?ids=a&ids=b"]}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    ),
  });
}
it("normalizes a bulk edit and retains per-device failures for retry", async () => {
  const outcome = [
    { device_id: "a", status: "changed" },
    { device_id: "b", status: "failed", error: "storage_failure" },
  ];
  api.bulkTags.mockResolvedValue(outcome);
  const { result } = setup();
  act(() => {
    result.current.form.setValue("key", "ECS");
    result.current.form.setValue("values", "East, West");
  });
  await act(async () => result.current.submit());
  await waitFor(() => expect(result.current.mutation.data).toEqual(outcome));
  expect(api.bulkTags).toHaveBeenCalledWith({
    target: { ids: ["a", "b"] },
    key: "ecs",
    values: ["east", "west"],
    operation: "add",
  });
  expect(result.current.form.getValues("ids")).toEqual(["a", "b"]);
});
it("uses global value replacement for rename without replacing other tag values", async () => {
  api.renameTag.mockResolvedValue([]);
  const { result } = setup();
  act(() => {
    result.current.form.setValue("key", "ECS");
    result.current.form.setValue("values", "East");
    result.current.form.setValue("operation", "rename");
    result.current.form.setValue("newValue", "North");
  });
  await act(async () => result.current.submit());
  await waitFor(() =>
    expect(api.renameTag).toHaveBeenCalledWith({
      key: "ecs",
      old_value: "east",
      new_value: "north",
    }),
  );
});
