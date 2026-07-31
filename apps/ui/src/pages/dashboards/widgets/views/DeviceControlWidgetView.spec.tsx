import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { GridoneError, type Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { StandardControlProps } from "@/pages/devices/standard-devices/types";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.deviceControl.empty": "Pick a device",
    "widgets.deviceControl.notFound": "This device no longer exists",
    "widgets.deviceControl.error": "Could not load this device",
    "widgets.deviceControl.noControl": "No standard control",
    "widgets.deviceControl.live": "Live",
  }),
);

const useDeviceById = vi.fn();
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id: string | undefined) => useDeviceById(id),
}));

// The write path is the device page's own hook; the widget's job is to wire
// the standard control to it, so the wiring is asserted, not the writes.
vi.mock("@/hooks/useDeviceDetails", () => ({
  useDeviceDetails: () => ({
    draft: {},
    savingAttr: null,
    feedback: null,
    handleDraftChange: vi.fn(),
    handleSave: vi.fn(),
  }),
}));

vi.mock("@/pages/devices/standard-devices/registry", () => ({
  getStandardDeviceEntry: (type: string | null | undefined) =>
    type === "thermostat"
      ? {
          Control: ({ device }: StandardControlProps) => (
            <div data-testid="standard-control">{device.id}</div>
          ),
        }
      : undefined,
}));

// Imported after the mocks are registered.
import { DeviceControlWidgetView } from "./DeviceControlWidgetView";

const DEVICE = {
  id: "dev1",
  name: "Thermostat hall",
  type: "thermostat",
  attributes: { connection_status: { current_value: "ok" } },
} as unknown as Device;
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
  it("renders the standard control with a live indicator and a device page link", () => {
    useDeviceById.mockReturnValue({ data: DEVICE, isLoading: false });

    const { container } = renderView();

    expect(screen.getByTestId("standard-control")).toHaveTextContent("dev1");
    expect(screen.getByText("Live")).toBeInTheDocument();
    // The dot carries the device's connection status colour.
    expect(container.querySelector(".bg-status-ok")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Thermostat hall" });
    expect(link).toHaveAttribute("href", "/devices/dev1");
  });

  it("names a device whose type has no standard control", () => {
    useDeviceById.mockReturnValue({
      data: { ...DEVICE, type: "relay" },
      isLoading: false,
    });

    renderView();

    expect(screen.getByText("No standard control")).toBeInTheDocument();
    expect(screen.queryByTestId("standard-control")).not.toBeInTheDocument();
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
    expect(screen.queryByTestId("standard-control")).not.toBeInTheDocument();
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
