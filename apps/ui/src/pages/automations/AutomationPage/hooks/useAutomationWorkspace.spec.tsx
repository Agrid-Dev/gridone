import { act, renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Automation, AutomationUpdate } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { useAutomationWorkspace } from "./useAutomationWorkspace";

const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ automations: { update } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ usePermissions: () => () => true }));
vi.mock("react-i18next", () => createI18nMock({}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("useAutomationWorkspace", () => {
  it("adopts server branch IDs after save and clears the dirty state", async () => {
    const action = { provider_id: "notification", params: { title: "Alarm" } };
    const automation: Automation = {
      id: "auto",
      name: "Tree",
      action,
      trigger: { provider_id: "schedule", params: {} },
      branches: [{ id: "first", name: "First", condition: null, action }],
    };
    update.mockImplementation(
      async (_id: string, payload: AutomationUpdate) => ({
        ...automation,
        ...payload,
        branches: payload.branches?.map((branch, index) => ({
          ...branch,
          id: branch.id ?? `new-${index}`,
          name: branch.name ?? "",
          condition: branch.condition ?? null,
        })),
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(
      () => {
        const { data } = useQuery({
          queryKey: ["automations", "auto"],
          queryFn: async () => automation,
          initialData: automation,
          enabled: false,
        });
        return useAutomationWorkspace("auto", data);
      },
      { wrapper },
    );
    act(() => result.current.expandTree());
    act(() =>
      result.current.onBranchesChange([...result.current.branches, { action }]),
    );
    expect(result.current.hasChanges).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    await waitFor(() => expect(result.current.branches[1].id).toBe("new-1"));
    expect(result.current.hasChanges).toBe(false);
    unmount();
    queryClient.clear();
  });
});
