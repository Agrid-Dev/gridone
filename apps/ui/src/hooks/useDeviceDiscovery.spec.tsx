import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createI18nMock } from "@/test/i18nMock";
import type { DiscoveryHandler } from "@gridone/sdk";

const {
  mockListTransportDiscoveries,
  mockCreateTransportDiscovery,
  mockDeleteTransportDiscovery,
  mockToastError,
} = vi.hoisted(() => ({
  mockListTransportDiscoveries: vi.fn(),
  mockCreateTransportDiscovery: vi.fn(),
  mockDeleteTransportDiscovery: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    transports: {
      listDiscoveryHandlers: (...args: unknown[]) =>
        mockListTransportDiscoveries(...args),
      createDiscoveryHandler: (...args: unknown[]) =>
        mockCreateTransportDiscovery(...args),
      deleteDiscoveryHandler: (...args: unknown[]) =>
        mockDeleteTransportDiscovery(...args),
    },
  }),
}));

vi.mock("sonner", () => ({ toast: { error: mockToastError } }));

vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.fields.discoverDevicesLikeMeError":
      "Unable to update discovery state",
  }),
);

// Imports below this line must come after the vi.mock calls.
import {
  useDeviceDiscovery,
  protocolSupportsDiscovery,
} from "./useDeviceDiscovery";

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

const TRANSPORT_ID = "tr-1";
const DRIVER_ID = "drv-1";

beforeEach(() => {
  mockListTransportDiscoveries.mockReset();
  mockCreateTransportDiscovery.mockReset();
  mockDeleteTransportDiscovery.mockReset();
  mockToastError.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("protocolSupportsDiscovery", () => {
  it("returns true only for mqtt", () => {
    expect(protocolSupportsDiscovery("mqtt")).toBe(true);
    expect(protocolSupportsDiscovery("http")).toBe(false);
    expect(protocolSupportsDiscovery("modbus-tcp")).toBe(false);
    expect(protocolSupportsDiscovery("bacnet")).toBe(false);
    expect(protocolSupportsDiscovery(undefined)).toBe(false);
  });
});

describe("useDeviceDiscovery", () => {
  it("reports unsupported when protocol is not mqtt", () => {
    const { result } = renderHook(
      () =>
        useDeviceDiscovery({
          transportId: TRANSPORT_ID,
          driverId: DRIVER_ID,
          protocol: "http",
          deferred: false,
        }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.supported).toBe(false);
    expect(mockListTransportDiscoveries).not.toHaveBeenCalled();
  });

  it("reflects existing server-side enabled state", async () => {
    const handlers: DiscoveryHandler[] = [
      { driver_id: DRIVER_ID, transport_id: TRANSPORT_ID, enabled: true },
    ];
    mockListTransportDiscoveries.mockResolvedValue(handlers);

    const { result } = renderHook(
      () =>
        useDeviceDiscovery({
          transportId: TRANSPORT_ID,
          driverId: DRIVER_ID,
          protocol: "mqtt",
          deferred: false,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.supported).toBe(true);
  });

  it("immediate mode: setEnabled(true) calls createTransportDiscovery", async () => {
    mockListTransportDiscoveries.mockResolvedValue([]);
    mockCreateTransportDiscovery.mockResolvedValue({
      driver_id: DRIVER_ID,
      transport_id: TRANSPORT_ID,
      enabled: true,
    });

    const { result } = renderHook(
      () =>
        useDeviceDiscovery({
          transportId: TRANSPORT_ID,
          driverId: DRIVER_ID,
          protocol: "mqtt",
          deferred: false,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.setEnabled(true));
    await waitFor(() =>
      expect(mockCreateTransportDiscovery).toHaveBeenCalledWith(TRANSPORT_ID, {
        driver_id: DRIVER_ID,
      }),
    );
  });

  it("immediate mode: setEnabled(false) calls deleteTransportDiscovery", async () => {
    mockListTransportDiscoveries.mockResolvedValue([
      { driver_id: DRIVER_ID, transport_id: TRANSPORT_ID, enabled: true },
    ]);
    mockDeleteTransportDiscovery.mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useDeviceDiscovery({
          transportId: TRANSPORT_ID,
          driverId: DRIVER_ID,
          protocol: "mqtt",
          deferred: false,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.enabled).toBe(true));
    act(() => result.current.setEnabled(false));
    await waitFor(() =>
      expect(mockDeleteTransportDiscovery).toHaveBeenCalledWith(
        TRANSPORT_ID,
        DRIVER_ID,
      ),
    );
  });

  it("deferred mode: setEnabled does not call API; flush commits the change", async () => {
    mockListTransportDiscoveries.mockResolvedValue([]);
    mockCreateTransportDiscovery.mockResolvedValue({
      driver_id: DRIVER_ID,
      transport_id: TRANSPORT_ID,
      enabled: true,
    });

    const { result } = renderHook(
      () =>
        useDeviceDiscovery({
          transportId: TRANSPORT_ID,
          driverId: DRIVER_ID,
          protocol: "mqtt",
          deferred: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.supported).toBe(true));

    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(mockCreateTransportDiscovery).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.flush();
    });
    expect(mockCreateTransportDiscovery).toHaveBeenCalledWith(TRANSPORT_ID, {
      driver_id: DRIVER_ID,
    });
  });

  it("surfaces a toast when an immediate-mode toggle mutation fails", async () => {
    mockListTransportDiscoveries.mockResolvedValue([]);
    mockCreateTransportDiscovery.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(
      () =>
        useDeviceDiscovery({
          transportId: TRANSPORT_ID,
          driverId: DRIVER_ID,
          protocol: "mqtt",
          deferred: false,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.setEnabled(true));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledTimes(1));
    expect(mockToastError.mock.calls[0][0]).toMatch(
      /Unable to update discovery state/,
    );
  });

  it("deferred mode: flush is a no-op when local intent matches server state", async () => {
    mockListTransportDiscoveries.mockResolvedValue([
      { driver_id: DRIVER_ID, transport_id: TRANSPORT_ID, enabled: true },
    ]);

    const { result } = renderHook(
      () =>
        useDeviceDiscovery({
          transportId: TRANSPORT_ID,
          driverId: DRIVER_ID,
          protocol: "mqtt",
          deferred: true,
        }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.enabled).toBe(true));

    // User toggles off then back on — net no-op vs. server state.
    act(() => result.current.setEnabled(false));
    act(() => result.current.setEnabled(true));

    await act(async () => {
      await result.current.flush();
    });

    expect(mockCreateTransportDiscovery).not.toHaveBeenCalled();
    expect(mockDeleteTransportDiscovery).not.toHaveBeenCalled();
  });
});
