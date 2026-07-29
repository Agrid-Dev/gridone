import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Device } from "@gridone/sdk";

const get = vi.fn();
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({ devices: { get } }),
}));

// Imported after the client mock is registered.
import { useDeviceById } from "../useDeviceById";

const DEVICE = { id: "dev1", name: "Thermostat 1" } as unknown as Device;

function setup(seed?: (client: QueryClient) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seed?.(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useDeviceById("dev1"), { wrapper });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useDeviceById", () => {
  // A page that already listed devices holds this one; refetching it just to
  // render what is on screen already shows a placeholder for no reason.
  it("renders straight away from a cached devices list", () => {
    const { result } = setup((client) =>
      client.setQueryData(["devices", { type: "thermostat" }], [DEVICE]),
    );

    expect(result.current.data).toEqual(DEVICE);
  });

  it("fetches when no cached list holds the device", async () => {
    get.mockResolvedValue(DEVICE);
    const { result } = setup((client) =>
      client.setQueryData(["devices", undefined], [{ id: "other" }]),
    );

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(DEVICE));
    expect(get).toHaveBeenCalledWith("dev1");
  });

  it("fetches when nothing is cached at all", async () => {
    get.mockResolvedValue(DEVICE);
    const { result } = setup();

    await waitFor(() => expect(result.current.data).toEqual(DEVICE));
  });
});
