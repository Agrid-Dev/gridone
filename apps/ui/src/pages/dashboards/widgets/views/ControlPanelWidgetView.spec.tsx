import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Device } from "@gridone/sdk";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.controlPanel.inactive": "Inactive",
    "widgets.controlPanel.inactiveReason": "This section is inactive.",
    "widgets.controlPanel.attributeMissing": "Attribute no longer exposed",
    "presentation.confirmed": "Applied",
    "common.true": "True",
    "common.false": "False",
  }),
);

const devices: Record<string, Device> = {};
vi.mock("@/hooks/useDevice", () => ({
  useDevice: (id: string | undefined) => ({
    data: id ? devices[id] : undefined,
    isLoading: false,
    error: null,
  }),
}));

// The write path is the device page's own runtime; the widget's job is to
// wire a switch to it and to lock it, so that wiring is what is asserted.
const setValue = vi.fn();
let write: { kind: string; requested?: boolean } = { kind: "idle" };
vi.mock("@/components/device-ui/runtime", () => ({
  useDeviceControlRuntime: (
    device: Device,
    _controls: unknown,
    { canWrite }: { canWrite: boolean },
  ) => ({
    deviceId: device.id,
    setValue: (attribute: string, value: boolean) =>
      setValue(device.id, attribute, value),
    readControl: (attribute: string) => ({
      displayed: device.attributes?.[attribute]?.current_value ?? null,
      canToggle: canWrite,
      write,
    }),
  }),
}));

// Imported after the mocks are registered.
import {
  CONFIRMATION_MS,
  ControlPanelWidgetView,
} from "./ControlPanelWidgetView";

const bool = (name: string, value: boolean, extra: object = {}) => ({
  name,
  kind: "standard",
  data_type: "bool",
  read_write_modes: ["read"],
  current_value: value,
  ...extra,
});

function setDevices({ autoMode }: { autoMode: boolean }) {
  devices.plc = {
    id: "plc",
    attributes: { auto_mode: bool("auto_mode", autoMode) },
  } as unknown as Device;
  devices.pump1 = {
    id: "pump1",
    attributes: {
      running: bool("running", true),
      command: bool("command", false, { read_write_modes: ["read", "write"] }),
      overheat: bool("overheat", true, {
        kind: "fault",
        severity: "alert",
        is_faulty: true,
      }),
    },
  } as unknown as Device;
}

const CONFIG = {
  type: "control_panel",
  sections: [
    {
      title: "Pump 1",
      active_when: {
        device_id: "plc",
        attribute: "auto_mode",
        value: false,
        inactive_reason: "Selector is on auto",
      },
      attributes: [
        { device_id: "pump1", attribute: "running", label: "Running" },
        { device_id: "pump1", attribute: "command", label: "Start" },
        { device_id: "pump1", attribute: "overheat", label: "Overheat" },
        { device_id: "pump1", attribute: "gone", label: "Gone" },
      ],
    },
    {
      title: "Selector",
      attributes: [
        { device_id: "plc", attribute: "auto_mode", label: "Auto mode" },
      ],
    },
  ],
};

const renderView = () =>
  render(
    <TooltipProvider>
      <ControlPanelWidgetView config={CONFIG} />
    </TooltipProvider>,
  );

const row = (label: string) => screen.getByText(label).closest("li")!;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  write = { kind: "idle" };
});

describe("ControlPanelWidgetView", () => {
  it("shows current boolean values across devices, split into sections", () => {
    setDevices({ autoMode: false });

    renderView();

    const pump = screen.getByRole("region", { name: "Pump 1" });
    expect(within(pump).getByText("Running").closest("li")).toHaveTextContent(
      "True",
    );
    const selector = screen.getByRole("region", { name: "Selector" });
    expect(
      within(selector).getByText("Auto mode").closest("li"),
    ).toHaveTextContent("False");
    // A row whose attribute has since disappeared says so, in place.
    expect(row("Gone")).toHaveTextContent("Attribute no longer exposed");
  });

  it("renders a fault as a fault", () => {
    setDevices({ autoMode: false });

    renderView();

    const fault = row("Overheat");
    expect(fault.querySelector('[data-severity="alert"]')).toBeInTheDocument();
    expect(fault.querySelector('[data-tone="neutral"]')).toBeNull();
    // A plain state carries no status tone.
    expect(row("Running").querySelector('[data-tone="neutral"]')).toBeTruthy();
  });

  it("commands a writable attribute while its section is active", async () => {
    setDevices({ autoMode: false });

    renderView();
    await userEvent.click(screen.getByRole("switch", { name: "Start" }));

    expect(setValue).toHaveBeenCalledWith("pump1", "command", true);
    expect(screen.queryByLabelText("Inactive")).toBeNull();
  });

  it("disables an inactive section's controls and says why on hover", async () => {
    setDevices({ autoMode: true });

    renderView();

    const toggle = screen.getByRole("switch", { name: "Start" });
    expect(toggle).toBeDisabled();
    expect(screen.getByLabelText("Inactive")).toBeInTheDocument();
    await userEvent.hover(toggle.parentElement!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Selector is on auto",
    );
  });

  it("acknowledges a confirmed write, then clears the acknowledgement", () => {
    vi.useFakeTimers();
    setDevices({ autoMode: false });
    write = { kind: "confirmed", requested: true };

    renderView();

    expect(screen.getByRole("status")).toHaveTextContent("Applied");
    act(() => {
      vi.advanceTimersByTime(CONFIRMATION_MS);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
