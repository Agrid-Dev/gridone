import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import { type Device } from "@/api/devices";

vi.mock("react-i18next", () =>
  createI18nMock({
    "devicesSection.title": "Devices using this driver",
    "devicesSection.empty": "No devices use this driver yet.",
    "devicesSection.error": "Unable to load devices.",
  }),
);

const mockUseDevicesList = vi.fn();
vi.mock("@/hooks/useDevicesList", () => ({
  useDevicesList: (...args: unknown[]) => mockUseDevicesList(...args),
}));

// Render DeviceCard as a thin link so this spec covers the section, not
// DeviceCard's internals (which have their own tests).
vi.mock("@/pages/devices/DeviceCard", () => ({
  DeviceCard: ({ device }: { device: Device }) => (
    <a href={`/devices/${device.id}`}>{device.name}</a>
  ),
}));

import { DriverDevicesSection } from "./DriverDevicesSection";

function physical(id: string, name: string, driverId: string): Device {
  return {
    id,
    name,
    type: null,
    tags: {},
    driverId,
    transportId: "tr",
    config: {},
    attributes: {},
    isFaulty: false,
  };
}

function renderSection(driverId = "drv-1") {
  return render(
    <MemoryRouter>
      <DriverDevicesSection driverId={driverId} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  mockUseDevicesList.mockReset();
});

describe("DriverDevicesSection", () => {
  it("requests the device list filtered by driverId and renders the result", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [
        physical("d1", "Alpha", "drv-1"),
        physical("d2", "Beta", "drv-1"),
      ],
      loading: false,
      error: null,
    });
    renderSection("drv-1");

    // Filtering happens server-side: the hook is called with the driver filter.
    expect(mockUseDevicesList).toHaveBeenCalledWith({ driverId: "drv-1" });

    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
    expect(
      screen.getByText("Devices using this driver (2)"),
    ).toBeInTheDocument();
  });

  it("shows an empty state when no device uses the driver", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [],
      loading: false,
      error: null,
    });
    renderSection("drv-1");

    expect(
      screen.getByText("No devices use this driver yet."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the device list fails to load", () => {
    mockUseDevicesList.mockReturnValue({
      devices: [],
      loading: false,
      error: "boom",
    });
    renderSection("drv-1");

    expect(screen.getByText("Unable to load devices.")).toBeInTheDocument();
  });
});
