import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { mockSetTag, mockDeleteTag, mockToastError, mockToastSuccess } =
  vi.hoisted(() => ({
    mockSetTag: vi.fn(),
    mockDeleteTag: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      setTag: (...args: unknown[]) => mockSetTag(...args),
      deleteTag: (...args: unknown[]) => mockDeleteTag(...args),
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Imports below this line must come after the vi.mock calls.
import { useDeviceAssetLink } from "./useDeviceAssetLink";

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useDeviceAssetLink("lobby"), { wrapper });
  return { invalidate, rendered };
}

/** Every query key the mutations claim to refresh, and why it holds a copy of
 *  the link: membership is a device tag, so both sides go stale at once. */
const INVALIDATED_KEYS = [["assets"], ["devices"]];

afterEach(() => {
  vi.clearAllMocks();
});

describe("useDeviceAssetLink", () => {
  it("links a device by tagging it with the asset id", async () => {
    mockSetTag.mockResolvedValue({ id: "thermostat" });
    const { invalidate, rendered } = setup();

    act(() => rendered.result.current.link.mutate("thermostat"));

    await waitFor(() =>
      expect(rendered.result.current.link.isSuccess).toBe(true),
    );
    expect(mockSetTag).toHaveBeenCalledWith("thermostat", "asset_id", "lobby");
    expect(mockToastSuccess).toHaveBeenCalledWith("devices.linked");
    for (const queryKey of INVALIDATED_KEYS) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("unlinks a device by deleting its asset tag", async () => {
    mockDeleteTag.mockResolvedValue(undefined);
    const { invalidate, rendered } = setup();

    act(() => rendered.result.current.unlink.mutate("thermostat"));

    await waitFor(() =>
      expect(rendered.result.current.unlink.isSuccess).toBe(true),
    );
    expect(mockDeleteTag).toHaveBeenCalledWith("thermostat", "asset_id");
    expect(mockToastSuccess).toHaveBeenCalledWith("devices.unlinked");
    for (const queryKey of INVALIDATED_KEYS) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("toasts and refreshes nothing when unlinking fails", async () => {
    mockDeleteTag.mockRejectedValue(new Error("boom"));
    const { invalidate, rendered } = setup();

    act(() => rendered.result.current.unlink.mutate("thermostat"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("boom"));
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
