import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { TooltipProvider } from "@/components/ui";
import { ThermostatControl } from "../ThermostatControl";
import { DeviceType, deviceAttributes } from "@/lib/devices";
import type { StandardControlProps } from "../../registry";

// --- Mocks ---

const mockChangeAndSave = vi.fn();
const mockChangeAndSaveNow = vi.fn();
const mockIsSaving: ReturnType<typeof vi.fn<(name: string) => boolean>> = vi.fn(
  () => false,
);

vi.mock("@/hooks/useDebouncedAttributeWrite", () => ({
  useDebouncedAttributeWrite: () => ({
    changeAndSave: mockChangeAndSave,
    changeAndSaveNow: mockChangeAndSaveNow,
    isSaving: mockIsSaving,
  }),
}));

vi.mock("react-i18next", () => createI18nMock({}));

// --- Fixtures ---

type AttributeFixture = {
  name: string;
  data_type: string;
  read_write_modes: string[];
  current_value: unknown;
  last_updated: string | null;
  value_options?: unknown[];
};

function makeThermostat(
  overrides: Partial<Record<string, Partial<AttributeFixture>>> = {},
): Device {
  const defaults: Record<string, AttributeFixture> = {
    temperature: {
      name: "temperature",
      data_type: "float",
      read_write_modes: ["read"],
      current_value: 21.5,
      last_updated: null,
    },
    temperature_setpoint: {
      name: "temperature_setpoint",
      data_type: "float",
      read_write_modes: ["read", "write"],
      current_value: 22.0,
      last_updated: null,
    },
    temperature_setpoint_min: {
      name: "temperature_setpoint_min",
      data_type: "float",
      read_write_modes: ["read"],
      current_value: 16,
      last_updated: null,
    },
    temperature_setpoint_max: {
      name: "temperature_setpoint_max",
      data_type: "float",
      read_write_modes: ["read"],
      current_value: 30,
      last_updated: null,
    },
    onoff_state: {
      name: "onoff_state",
      data_type: "bool",
      read_write_modes: ["read", "write"],
      current_value: true,
      last_updated: null,
    },
    mode: {
      name: "mode",
      data_type: "string",
      read_write_modes: ["read"],
      current_value: "heat",
      last_updated: null,
    },
  };

  for (const [key, val] of Object.entries(overrides)) {
    if (val === undefined) {
      delete defaults[key];
    } else {
      defaults[key] = { ...defaults[key], ...val };
    }
  }

  return {
    id: "dev-1",
    name: "Living Room Thermostat",
    type: DeviceType.Thermostat,
    tags: {},
    driver_id: "drv-1",
    transport_id: "tr-1",
    config: {},
    attributes: defaults as Device["attributes"],
    is_faulty: false,
  };
}

function renderControl(
  device: Device = makeThermostat(),
  propsOverrides: Partial<StandardControlProps> = {},
) {
  const draft: Record<string, string | number | boolean | null> = {};
  for (const [name, attr] of Object.entries(deviceAttributes(device))) {
    draft[name] = (attr as AttributeFixture).current_value as
      | string
      | number
      | boolean
      | null;
  }

  const props: StandardControlProps = {
    device,
    draft,
    savingAttr: null,
    feedback: null,
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    ...propsOverrides,
  };

  return render(
    <TooltipProvider>
      <ThermostatControl {...props} />
    </TooltipProvider>,
  );
}

// --- Tests ---

describe("ThermostatControl", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockChangeAndSave.mockReset();
    mockChangeAndSaveNow.mockReset();
    mockIsSaving.mockReset();
    mockIsSaving.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the measured temperature", () => {
    renderControl();
    expect(screen.getByText("21.5 °C")).toBeInTheDocument();
  });

  it("renders the setpoint from draft", () => {
    renderControl();
    expect(screen.getByText("22.0")).toBeInTheDocument();
  });

  it("renders power button with ON label when on", () => {
    renderControl();
    expect(screen.getByText("controls.thermostat.on")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "controls.thermostat.turnOff" }),
    ).toBeInTheDocument();
  });

  it("renders power button with OFF label when off", () => {
    const device = makeThermostat({
      onoff_state: { current_value: false },
    });
    renderControl(device);
    expect(screen.getByText("controls.thermostat.off")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "controls.thermostat.turnOn" }),
    ).toBeInTheDocument();
  });

  it("calls changeAndSave with incremented setpoint on plus click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderControl();

    const upButton = screen.getByRole("button", {
      name: "controls.thermostat.increaseSetpoint",
    });
    await user.click(upButton);

    expect(mockChangeAndSave).toHaveBeenCalledWith(
      "temperature_setpoint",
      22.5,
    );
  });

  it("calls changeAndSave with decremented setpoint on minus click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderControl();

    const downButton = screen.getByRole("button", {
      name: "controls.thermostat.decreaseSetpoint",
    });
    await user.click(downButton);

    expect(mockChangeAndSave).toHaveBeenCalledWith(
      "temperature_setpoint",
      21.5,
    );
  });

  it("routes a dial adjustment through the same debounced write as the steppers", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderControl();

    const dial = screen.getByRole("slider");
    await user.type(dial, "{ArrowUp}");

    expect(mockChangeAndSave).toHaveBeenCalledWith(
      "temperature_setpoint",
      22.5,
    );
  });

  it("bounds the dial by the device's setpoint range", () => {
    const device = makeThermostat({
      temperature_setpoint_min: { current_value: 18 },
      temperature_setpoint_max: { current_value: 24 },
    });
    renderControl(device);

    const dial = screen.getByRole("slider");
    expect(dial).toHaveAttribute("aria-valuemin", "18");
    expect(dial).toHaveAttribute("aria-valuemax", "24");
    expect(dial).toHaveAttribute("aria-valuenow", "22");
  });

  it("calls changeAndSaveNow on power toggle", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderControl();

    const powerButton = screen.getByRole("button", {
      name: "controls.thermostat.turnOff",
    });
    await user.click(powerButton);

    expect(mockChangeAndSaveNow).toHaveBeenCalledWith("onoff_state", false);
  });

  it("disables power button while saving onoff_state", () => {
    mockIsSaving.mockImplementation((name: string) => name === "onoff_state");
    renderControl();

    const powerButton = screen.getByRole("button", {
      name: "controls.thermostat.turnOff",
    });
    expect(powerButton).toBeDisabled();
  });

  it("disables steppers while saving temperature_setpoint", () => {
    mockIsSaving.mockImplementation(
      (name: string) => name === "temperature_setpoint",
    );
    renderControl();

    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.increaseSetpoint",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.decreaseSetpoint",
      }),
    ).toBeDisabled();
  });

  it("keeps plus enabled when max bound is missing", () => {
    const device = makeThermostat({
      temperature_setpoint_max: { current_value: null },
    });
    renderControl(device);

    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.increaseSetpoint",
      }),
    ).toBeEnabled();
  });

  it("keeps minus enabled when min bound is missing", () => {
    const device = makeThermostat({
      temperature_setpoint_min: { current_value: null },
    });
    renderControl(device);

    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.increaseSetpoint",
      }),
    ).toBeEnabled();
  });

  it("disables plus at max bound", () => {
    const device = makeThermostat({
      temperature_setpoint: { current_value: 30 },
      temperature_setpoint_max: { current_value: 30 },
    });
    renderControl(device);

    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.increaseSetpoint",
      }),
    ).toBeDisabled();
  });

  it("disables minus at min bound", () => {
    const device = makeThermostat({
      temperature_setpoint: { current_value: 16 },
      temperature_setpoint_min: { current_value: 16 },
    });
    renderControl(device);

    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.decreaseSetpoint",
      }),
    ).toBeDisabled();
  });

  it("shows humidity only when the attribute is present", () => {
    const withHumidity = makeThermostat({
      humidity: {
        name: "humidity",
        data_type: "float",
        read_write_modes: ["read"],
        current_value: 43,
        last_updated: null,
      },
    });
    renderControl(withHumidity);
    expect(screen.getByText("43 %")).toBeInTheDocument();

    cleanup();
    renderControl();
    expect(screen.queryByText("43 %")).not.toBeInTheDocument();
  });

  it("hides the mode picker when the mode attribute is read-only", () => {
    renderControl();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("offers the modes declared in value_options, current one checked", () => {
    const device = makeThermostat({
      mode: {
        read_write_modes: ["read", "write"],
        value_options: ["heat", "cool", "auto"],
      },
    });
    renderControl(device);

    const group = screen.getByRole("radiogroup");
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "heat" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "cool" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("writes the mode immediately when picking another segment", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const device = makeThermostat({
      mode: {
        read_write_modes: ["read", "write"],
        value_options: ["heat", "cool", "auto"],
      },
    });
    renderControl(device);

    await user.click(screen.getByRole("radio", { name: "cool" }));
    expect(mockChangeAndSaveNow).toHaveBeenCalledWith("mode", "cool");
  });

  it("ignores clicks on the already-active mode", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const device = makeThermostat({
      mode: {
        read_write_modes: ["read", "write"],
        value_options: ["heat", "cool", "auto"],
      },
    });
    renderControl(device);

    await user.click(screen.getByRole("radio", { name: "heat" }));
    expect(mockChangeAndSaveNow).not.toHaveBeenCalled();
  });

  it("returns null for non-thermostat devices", () => {
    const device = makeThermostat();
    device.type = null;
    const { container } = renderControl(device);
    expect(container.innerHTML).toBe("");
  });
});
