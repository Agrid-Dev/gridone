import { beforeEach, describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { GridoneError } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

const { mockCreateDevice, mockUpdateDevice, mockToastError, mockToastSuccess } =
  vi.hoisted(() => ({
    mockCreateDevice: vi.fn(),
    mockUpdateDevice: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      create: (...args: unknown[]) => mockCreateDevice(...args),
      update: (...args: unknown[]) => mockUpdateDevice(...args),
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));

vi.mock("@/pages/drivers/useDrivers", () => ({
  useDrivers: () => ({ driversListQuery: { data: [DRIVER] } }),
}));

vi.mock("@/pages/transports/useTransports", () => ({
  useTransports: () => ({ transportsListQuery: { data: [TRANSPORT] } }),
}));

vi.mock("@/hooks/useDeviceDiscovery", () => ({
  useDeviceDiscovery: () => ({ flush: vi.fn(), enabled: false }),
  protocolSupportsDiscovery: () => false,
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.feedback.createError": "Failed to create device",
    "devices.feedback.updateError": "Failed to update device",
    "devices.feedback.duplicateConfig":
      "A device with this driver, network and configuration already exists",
    "devices.feedback.updated": "Device updated",
  }),
);

// Imports below this line must come after the vi.mock calls.
import { useDeviceForm } from "./useDeviceForm";

const DRIVER = {
  id: "drv-1",
  transport: "mqtt",
  vendor: null,
  model: null,
  version: null,
  device_config: [],
};
const TRANSPORT = { id: "tr-1", name: "Broker", protocol: "mqtt" };
const DEVICE = {
  id: "dev-1",
  name: "Existing",
  driver_id: "drv-1",
  transport_id: "tr-1",
  config: {},
} as never;

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

/** Fill the fields the form validates, then submit. */
async function submit(result: { current: ReturnType<typeof useDeviceForm> }) {
  act(() => {
    result.current.baseFormMethods.setValue("name", "A device");
    result.current.baseFormMethods.setValue("driverId", DRIVER.id);
  });
  act(() => {
    result.current.baseFormMethods.setValue("transportId", TRANSPORT.id);
  });
  await act(async () => {
    await result.current.handleSubmit();
  });
}

beforeEach(() => {
  mockCreateDevice.mockReset();
  mockUpdateDevice.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
});

describe("useDeviceForm save failures", () => {
  it("reports a failed create instead of looking like a no-op", async () => {
    mockCreateDevice.mockRejectedValue(
      new GridoneError(500, "Internal Server Error"),
    );
    const { result } = renderHook(() => useDeviceForm(), {
      wrapper: makeWrapper(),
    });

    await submit(result);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Failed to create device"),
    );
  });

  it("names the conflict on a duplicate create, not the server's own wording", async () => {
    // The server's 409 text quotes raw driver, transport and device ids.
    mockCreateDevice.mockRejectedValue(
      new GridoneError(
        409,
        "Device config is identical to existing device 'x'",
      ),
    );
    const { result } = renderHook(() => useDeviceForm(), {
      wrapper: makeWrapper(),
    });

    await submit(result);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "A device with this driver, network and configuration already exists",
      ),
    );
  });

  it("names the conflict on a duplicate update too", async () => {
    mockUpdateDevice.mockRejectedValue(
      new GridoneError(
        409,
        "Device config is identical to existing device 'x'",
      ),
    );
    const { result } = renderHook(() => useDeviceForm(DEVICE), {
      wrapper: makeWrapper(),
    });

    await submit(result);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "A device with this driver, network and configuration already exists",
      ),
    );
  });

  it("appends server-authored detail when the failure carries showable text", async () => {
    mockCreateDevice.mockRejectedValue(
      new GridoneError(404, "Driver not found"),
    );
    const { result } = renderHook(() => useDeviceForm(), {
      wrapper: makeWrapper(),
    });

    await submit(result);

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to create device: Driver not found",
      ),
    );
  });
});
