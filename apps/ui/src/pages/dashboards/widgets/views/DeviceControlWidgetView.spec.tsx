import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GridoneError, type Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.deviceControl.empty": "Pick a device",
    "widgets.deviceControl.notFound": "This device no longer exists",
    "widgets.deviceControl.error": "Could not load this device",
    "widgets.deviceControl.live": "Live",
  }),
);

const useDeviceById = vi.fn();
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id: string | undefined) => useDeviceById(id),
}));

// The surface is the device page's own component; the widget's job is only to
// resolve the device and frame it, so the embed is asserted by name.
vi.mock("@/pages/devices/device/DeviceLiveControl", () => ({
  DeviceControlSurface: ({ device }: { device: Device }) => (
    <div data-testid="control-surface">{device.id}</div>
  ),
}));

// Imported after the mocks are registered.
import { DeviceControlWidgetView } from "./DeviceControlWidgetView";

const DEVICE = { id: "dev1", name: "Thermostat hall", type: "thermostat" };
const CONFIG = { type: "device_control", device_id: "dev1" };

function renderView(config: unknown = CONFIG) {
  return render(
    <MemoryRouter>
      <DeviceControlWidgetView config={config} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeviceControlWidgetView", () => {
  it("renders the control surface with a live indicator and a device page link", () => {
    useDeviceById.mockReturnValue({ data: DEVICE, isLoading: false });

    renderView();

    expect(screen.getByTestId("control-surface")).toHaveTextContent("dev1");
    expect(screen.getByText("Live")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Thermostat hall" });
    expect(link).toHaveAttribute("href", "/devices/dev1");
  });

  it("renders an explicit state for a deleted device", () => {
    useDeviceById.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new GridoneError(404, "not found"),
    });

    renderView();

    expect(
      screen.getByText("This device no longer exists"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("control-surface")).not.toBeInTheDocument();
  });

  it("renders a generic error state when the device cannot be loaded", () => {
    useDeviceById.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new GridoneError(500, "boom"),
    });

    renderView();

    expect(screen.getByText("Could not load this device")).toBeInTheDocument();
  });

  it("prompts for a device while none is picked (editor preview)", () => {
    useDeviceById.mockReturnValue({ data: undefined, isLoading: false });

    renderView({ type: "device_control", device_id: "" });

    expect(screen.getByText("Pick a device")).toBeInTheDocument();
    // No fetch is issued for an empty id.
    expect(useDeviceById).toHaveBeenCalledWith(undefined);
  });
});
