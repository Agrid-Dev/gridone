import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createI18nMock } from "@/test/i18nMock";
import type { DiscoveryHandler, Transport } from "@gridone/sdk";

const { mockList, mockListHandlers, mockCreate, mockDelete, mockToastError } =
  vi.hoisted(() => ({
    mockList: vi.fn(),
    mockListHandlers: vi.fn(),
    mockCreate: vi.fn(),
    mockDelete: vi.fn(),
    mockToastError: vi.fn(),
  }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    transports: {
      list: (...args: unknown[]) => mockList(...args),
      listDiscoveryHandlers: (...args: unknown[]) => mockListHandlers(...args),
      createDiscoveryHandler: (...args: unknown[]) => mockCreate(...args),
      deleteDiscoveryHandler: (...args: unknown[]) => mockDelete(...args),
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

vi.mock("react-i18next", () =>
  createI18nMock({
    "discoverySection.updateError": "Unable to update discovery state",
  }),
);

// Imports below this line must come after the vi.mock calls.
import { useDriverDiscovery } from "./useDriverDiscovery";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const DRIVER = { id: "drv-1", transport: "mqtt" as const };

const mqtt = (id: string): Transport =>
  ({
    id,
    name: `Broker ${id}`,
    protocol: "mqtt",
    connection_state: "connected",
    config: {},
  }) as unknown as Transport;

const http = (id: string): Transport =>
  ({
    id,
    name: `Gateway ${id}`,
    protocol: "http",
    connection_state: "connected",
    config: {},
  }) as unknown as Transport;

const handler = (
  driverId: string,
  transportId: string,
  enabled: boolean,
): DiscoveryHandler => ({
  driver_id: driverId,
  transport_id: transportId,
  enabled,
});

beforeEach(() => {
  mockList.mockReset();
  mockListHandlers.mockReset();
  mockCreate.mockReset();
  mockDelete.mockReset();
  mockToastError.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("useDriverDiscovery", () => {
  it("lists only networks speaking the driver's protocol, with their state", async () => {
    mockList.mockResolvedValue([mqtt("m1"), http("h1"), mqtt("m2")]);
    mockListHandlers.mockImplementation(async (transportId: string) =>
      transportId === "m1"
        ? [handler("drv-1", "m1", true), handler("other", "m1", true)]
        : [handler("drv-1", "m2", false)],
    );

    const { result } = renderHook(() => useDriverDiscovery(DRIVER), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.transports).toHaveLength(2));
    await waitFor(() =>
      expect(result.current.transports.every((t) => !t.loading)).toBe(true),
    );
    expect(mockListHandlers).not.toHaveBeenCalledWith("h1");
    expect(
      result.current.transports.map(({ transport, enabled }) => [
        transport.id,
        enabled,
      ]),
    ).toEqual([
      ["m1", true],
      ["m2", false],
    ]);
  });

  it("registers and unregisters the handler on the chosen network", async () => {
    mockList.mockResolvedValue([mqtt("m1")]);
    mockListHandlers.mockResolvedValue([]);
    mockCreate.mockResolvedValue(handler("drv-1", "m1", true));
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDriverDiscovery(DRIVER), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.transports).toHaveLength(1));

    act(() => result.current.setEnabled("m1", true));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith("m1", { driver_id: "drv-1" }),
    );

    act(() => result.current.setEnabled("m1", false));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("m1", "drv-1"));
  });

  it("reports a failed update with a toast", async () => {
    mockList.mockResolvedValue([mqtt("m1")]);
    mockListHandlers.mockResolvedValue([]);
    mockCreate.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useDriverDiscovery(DRIVER), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.transports).toHaveLength(1));

    act(() => result.current.setEnabled("m1", true));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(mockToastError.mock.calls[0][0]).toMatch(
      /^Unable to update discovery state/,
    );
  });
});
