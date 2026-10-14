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
import { findDeviceInCachedLists, useDeviceById } from "../useDeviceById";
import { FLEET_KEY } from "@/pages/devices/standard-devices/fleetAttributes";

const DEVICE = { id: "dev1", name: "Thermostat 1" } as unknown as Device;
/** The same device as a fleet list holds it: a few attributes only. */
const FLEET_DEVICE = {
  id: "dev1",
  name: "Thermostat 1",
  attributes: { temperature: { name: "temperature", current_value: 21 } },
} as unknown as Device;

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

  // Seeded from a fleet list, the device page would miss most attributes
  // until its own fetch lands.
  it("fetches rather than render the device a fleet list holds", async () => {
    get.mockResolvedValue(DEVICE);
    const { result } = setup((client) =>
      client.setQueryData(["devices", FLEET_KEY, undefined], [FLEET_DEVICE]),
    );

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(DEVICE));
    expect(get).toHaveBeenCalledWith("dev1");
  });

  it("fetches after visiting automations with a device trigger", async () => {
    get.mockResolvedValue(DEVICE);
    const { result } = setup((client) => {
      client.setQueryData(["devices", FLEET_KEY, undefined], [FLEET_DEVICE]);
      // TriggerChip and ChangeEventPresenter cache one device under this key.
      client.setQueryData(["devices", "dev1"], DEVICE);
    });

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual(DEVICE));
    expect(get).toHaveBeenCalledWith("dev1");
  });
});

describe("findDeviceInCachedLists", () => {
  it("skips every fleet list, filtered or not", () => {
    const client = new QueryClient();
    client.setQueryData(["devices", FLEET_KEY, undefined], [FLEET_DEVICE]);
    client.setQueryData(
      ["devices", FLEET_KEY, { types: ["thermostat"] }],
      [FLEET_DEVICE],
    );

    expect(findDeviceInCachedLists(client, "dev1")).toBeUndefined();
  });

  it("finds the device and age in a full list after fleet and individual entries", () => {
    const client = new QueryClient();
    client.setQueryData(["devices", FLEET_KEY, undefined], [FLEET_DEVICE]);
    client.setQueryData(["devices", "dev1"], DEVICE);
    client.setQueryData(["devices", undefined], [DEVICE], { updatedAt: 123 });

    expect(findDeviceInCachedLists(client, "dev1")).toEqual({
      device: DEVICE,
      updatedAt: 123,
    });
  });
});
