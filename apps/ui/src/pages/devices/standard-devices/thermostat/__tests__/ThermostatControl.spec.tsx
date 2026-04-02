import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui";
import { ThermostatControl } from "../ThermostatControl";
import type { Device } from "@/api/devices";
import type { StandardControlProps } from "../../registry";

// --- Mocks ---

const mockChangeAndSave = vi.fn();
const mockChangeAndSaveNow = vi.fn();
const mockIsSaving = vi.fn(() => false);

vi.mock("@/hooks/useDebouncedAttributeWrite", () => ({
  useDebouncedAttributeWrite: () => ({
    changeAndSave: mockChangeAndSave,
    changeAndSaveNow: mockChangeAndSaveNow,
    isSaving: mockIsSaving,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// --- Fixtures ---

function makeThermostat(
  overrides: Partial<Record<string, { currentValue: unknown }>> = {},
): Device {
  const defaults: Record<
    string,
    {
      name: string;
      dataType: string;
      readWriteModes: string[];
      currentValue: unknown;
      lastUpdated: string | null;
    }
  > = {
    temperature: {
      name: "temperature",
      dataType: "float",
      readWriteModes: ["read"],
      currentValue: 21.5,
      lastUpdated: null,
    },
    temperatureSetpoint: {
      name: "temperatureSetpoint",
      dataType: "float",
      readWriteModes: ["read", "write"],
      currentValue: 22.0,
      lastUpdated: null,
    },
    temperatureSetpointMin: {
      name: "temperatureSetpointMin",
      dataType: "float",
      readWriteModes: ["read"],
      currentValue: 16,
      lastUpdated: null,
    },
    temperatureSetpointMax: {
      name: "temperatureSetpointMax",
      dataType: "float",
      readWriteModes: ["read"],
      currentValue: 30,
      lastUpdated: null,
    },
    onoffState: {
      name: "onoffState",
      dataType: "bool",
      readWriteModes: ["read", "write"],
      currentValue: true,
      lastUpdated: null,
    },
    mode: {
      name: "mode",
      dataType: "string",
      readWriteModes: ["read"],
      currentValue: "heating",
      lastUpdated: null,
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
    type: "thermostat",
    driverId: "drv-1",
    transportId: "tr-1",
    config: {},
    attributes: defaults as Device["attributes"],
  };
}

function renderControl(
  device: Device = makeThermostat(),
  propsOverrides: Partial<StandardControlProps> = {},
) {
  const draft: Record<string, string | number | boolean | null> = {};
  for (const [name, attr] of Object.entries(device.attributes)) {
    draft[name] = attr.currentValue;
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

  it("renders the current temperature", () => {
    renderControl();
    expect(screen.getByText("21.5°")).toBeInTheDocument();
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
      onoffState: { currentValue: false },
    });
    renderControl(device);
    expect(screen.getByText("controls.thermostat.off")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "controls.thermostat.turnOn" }),
    ).toBeInTheDocument();
  });

  it("renders the mode label", () => {
    renderControl();
    expect(screen.getByText("heating")).toBeInTheDocument();
  });

  it("calls changeAndSave with incremented setpoint on up arrow click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderControl();

    const upButton = screen.getByRole("button", {
      name: "controls.thermostat.increaseSetpoint",
    });
    await user.click(upButton);

    expect(mockChangeAndSave).toHaveBeenCalledWith("temperatureSetpoint", 22.5);
  });

  it("calls changeAndSave with decremented setpoint on down arrow click", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderControl();

    const downButton = screen.getByRole("button", {
      name: "controls.thermostat.decreaseSetpoint",
    });
    await user.click(downButton);

    expect(mockChangeAndSave).toHaveBeenCalledWith("temperatureSetpoint", 21.5);
  });

  it("calls changeAndSaveNow on power toggle", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderControl();

    const powerButton = screen.getByRole("button", {
      name: "controls.thermostat.turnOff",
    });
    await user.click(powerButton);

    expect(mockChangeAndSaveNow).toHaveBeenCalledWith("onoffState", false);
  });

  it("disables power button while saving onoffState", () => {
    mockIsSaving.mockImplementation((name: string) => name === "onoffState");
    renderControl();

    const powerButton = screen.getByRole("button", {
      name: "controls.thermostat.turnOff",
    });
    expect(powerButton).toBeDisabled();
  });

  it("disables arrows while saving temperatureSetpoint", () => {
    mockIsSaving.mockImplementation(
      (name: string) => name === "temperatureSetpoint",
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

  it("hides up arrow when max bound is missing", () => {
    const device = makeThermostat({
      temperatureSetpointMax: { currentValue: null },
    });
    renderControl(device);

    expect(
      screen.queryByRole("button", {
        name: "controls.thermostat.increaseSetpoint",
      }),
    ).not.toBeInTheDocument();
  });

  it("hides down arrow when min bound is missing", () => {
    const device = makeThermostat({
      temperatureSetpointMin: { currentValue: null },
    });
    renderControl(device);

    expect(
      screen.queryByRole("button", {
        name: "controls.thermostat.decreaseSetpoint",
      }),
    ).not.toBeInTheDocument();
  });

  it("disables up arrow at max bound", () => {
    const device = makeThermostat({
      temperatureSetpoint: { currentValue: 30 },
      temperatureSetpointMax: { currentValue: 30 },
    });
    renderControl(device);

    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.increaseSetpoint",
      }),
    ).toBeDisabled();
  });

  it("disables down arrow at min bound", () => {
    const device = makeThermostat({
      temperatureSetpoint: { currentValue: 16 },
      temperatureSetpointMin: { currentValue: 16 },
    });
    renderControl(device);

    expect(
      screen.getByRole("button", {
        name: "controls.thermostat.decreaseSetpoint",
      }),
    ).toBeDisabled();
  });

  it("returns null for non-thermostat devices", () => {
    const device = makeThermostat();
    device.type = null;
    const { container } = renderControl(device);
    expect(container.innerHTML).toBe("");
  });
});
