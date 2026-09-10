import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Device } from "@gridone/sdk";
import { GridoneError } from "@gridone/sdk";

const { mockSendCommand, mockGet } = vi.hoisted(() => ({
  mockSendCommand: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: {
      sendCommand: (...args: unknown[]) => mockSendCommand(...args),
      get: (...args: unknown[]) => mockGet(...args),
    },
  }),
}));

// Imports below this line must come after the vi.mock calls.
import { useDeviceControlRuntime } from "../useDeviceControlRuntime";
import type { ControlSpec } from "../controls";

const CONTROLS: Record<string, ControlSpec> = {
  target: {
    kind: "number",
    attribute: "temperature_setpoint",
    label: { default: "Setpoint" },
  },
  power: {
    kind: "toggle",
    attribute: "onoff_state",
    label: { default: "Power" },
  },
  fan: { kind: "select", attribute: "fan_speed", label: { default: "Fan" } },
  ghost: { kind: "number", attribute: "missing", label: { default: "Ghost" } },
};

function makeDevice(
  overrides: Record<string, Partial<Record<string, unknown>>> = {},
): Device {
  const attributes: Record<string, Record<string, unknown>> = {
    temperature_setpoint: {
      name: "temperature_setpoint",
      data_type: "float",
      read_write_modes: ["read", "write"],
      current_value: 21,
      write_constraints: {
        step: { attribute: "precision" },
        minimum: 16,
        maximum: 30,
      },
    },
    precision: {
      name: "precision",
      data_type: "float",
      read_write_modes: ["read"],
      current_value: 0.5,
    },
    onoff_state: {
      name: "onoff_state",
      data_type: "bool",
      read_write_modes: ["read", "write"],
      current_value: true,
    },
    fan_speed: {
      name: "fan_speed",
      data_type: "string",
      read_write_modes: ["read"],
      current_value: "low",
      value_options: ["low", "high"],
    },
  };
  for (const [name, patch] of Object.entries(overrides)) {
    attributes[name] = { ...attributes[name], ...patch };
  }
  return {
    id: "dev-1",
    name: "Thermostat",
    type: "thermostat",
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    tags: {},
    is_faulty: false,
    created_at: "2026-09-09T00:00:00Z",
    updated_at: "2026-09-09T00:00:00Z",
    attributes,
  } as unknown as Device;
}

function setup(device = makeDevice(), canWrite = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    ({ device: current }: { device: Device }) =>
      useDeviceControlRuntime(current, CONTROLS, { debounceMs: 600, canWrite }),
    { wrapper, initialProps: { device } },
  );
  return { queryClient, rendered };
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGet.mockResolvedValue(
    makeDevice({ temperature_setpoint: { current_value: 21.5 } }),
  );
  mockSendCommand.mockResolvedValue({ id: "cmd" });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Reads the control during render, the way widgets do. */
function DisplayedSetpoint({ device }: { device: Device }) {
  const runtime = useDeviceControlRuntime(device, CONTROLS, {
    debounceMs: 600,
  });
  const target = runtime.readControl("target");
  return (
    <>
      <output data-testid="displayed">
        {target?.displayed === null ? "unknown" : String(target?.displayed)}
      </output>
      <button
        type="button"
        onClick={() => runtime.activate({ control: "target", op: "increment" })}
      >
        up
      </button>
    </>
  );
}

describe("useDeviceControlRuntime", () => {
  it("rejects direct actions and writes when the user lacks device write permission", () => {
    const { rendered } = setup(makeDevice(), false);
    expect(rendered.result.current.readControl("power")?.writable).toBe(false);
    act(() => {
      rendered.result.current.setValue("power", false);
      rendered.result.current.activate({ control: "power", op: "toggle" });
    });
    expect(mockSendCommand).not.toHaveBeenCalled();
  });
  it("re-renders consumers when the runtime learns the reported values", async () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DisplayedSetpoint device={makeDevice()} />
      </QueryClientProvider>,
    );
    // The reported values reach the runtime after mount; the DOM must follow
    // without any other state change.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("displayed")).toHaveTextContent("21");
  });

  it("keeps working under StrictMode's simulated remount", async () => {
    const queryClient = new QueryClient();
    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <DisplayedSetpoint device={makeDevice()} />
        </QueryClientProvider>
      </StrictMode>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => screen.getByRole("button", { name: "up" }).click());
    // The intention shows at once, and the command leaves after the debounce.
    expect(screen.getByTestId("displayed")).toHaveTextContent("21.5");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mockSendCommand).toHaveBeenCalledTimes(1);
  });

  it("reads a control from the attribute contract", () => {
    const { rendered } = setup();
    const target = rendered.result.current.readControl("target");
    expect(target).toMatchObject({
      reported: 21,
      displayed: 21,
      writable: true,
      write: { kind: "idle" },
      constraints: { step: 0.5, minimum: 16, maximum: 30, unknown: false },
      canIncrement: true,
      canDecrement: true,
      canToggle: false,
      canCycle: false,
    });
    expect(rendered.result.current.readControl("fan")).toMatchObject({
      writable: false,
      options: ["low", "high"],
      canCycle: false,
    });
    expect(rendered.result.current.readControl("ghost")?.writable).toBe(false);
    expect(rendered.result.current.readControl("nope")).toBeUndefined();
  });

  it("steps the setpoint with the device's precision and sends one confirmed command after the debounce", async () => {
    const { queryClient, rendered } = setup();
    act(() => {
      rendered.result.current.activate({ control: "target", op: "increment" });
      rendered.result.current.activate({ control: "target", op: "increment" });
      rendered.result.current.activate({ control: "target", op: "decrement" });
    });
    expect(rendered.result.current.readControl("target")).toMatchObject({
      displayed: 21.5,
      reported: 21,
      pending: true,
    });
    expect(mockSendCommand).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mockSendCommand).toHaveBeenCalledTimes(1);
    expect(mockSendCommand).toHaveBeenCalledWith("dev-1", {
      attribute: "temperature_setpoint",
      value: 21.5,
      confirm: true,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rendered.result.current.readControl("target")?.write).toEqual({
      kind: "confirmed",
      requested: 21.5,
    });
    // The device was refetched into the query cache so the reported value
    // catches up without waiting for a push.
    expect(mockGet).toHaveBeenCalledWith("dev-1");
    expect(
      (
        queryClient.getQueryData<Device>(["device", "dev-1"])
          ?.attributes as Record<string, { current_value: number }>
      ).temperature_setpoint.current_value,
    ).toBe(21.5);
  });

  it("sends a toggle at once and ignores actions the contract does not allow", async () => {
    const { rendered } = setup();
    act(() => {
      rendered.result.current.activate({ control: "power", op: "toggle" });
      rendered.result.current.activate({ control: "fan", op: "cycle" }); // not writable
      rendered.result.current.activate({ control: "target", op: "toggle" }); // kind mismatch
    });
    expect(mockSendCommand).toHaveBeenCalledTimes(1);
    expect(mockSendCommand).toHaveBeenCalledWith("dev-1", {
      attribute: "onoff_state",
      value: false,
      confirm: true,
    });
  });

  it("keeps increments unavailable while the referenced step is unknown", () => {
    const { rendered } = setup(
      makeDevice({ precision: { current_value: null } }),
    );
    const target = rendered.result.current.readControl("target");
    expect(target?.constraints.unknown).toBe(true);
    expect(target?.canIncrement).toBe(false);
    act(() =>
      rendered.result.current.activate({ control: "target", op: "increment" }),
    );
    expect(mockSendCommand).not.toHaveBeenCalled();
  });

  it("reports an unconfirmed write on a 409 and an error otherwise", async () => {
    mockSendCommand.mockRejectedValueOnce(new GridoneError(409, "no echo"));
    const { rendered } = setup();
    act(() => rendered.result.current.setValue("power", false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rendered.result.current.readControl("power")?.write).toEqual({
      kind: "unconfirmed",
      requested: false,
      message: "no echo",
    });
    mockSendCommand.mockRejectedValueOnce(
      new GridoneError(422, "out of range"),
    );
    act(() =>
      rendered.result.current.setValue("target", 40, { immediate: true }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rendered.result.current.readControl("target")).toMatchObject({
      displayed: 21,
      write: { kind: "error", requested: 40, message: "out of range" },
    });
  });

  it("follows the device's reported values without overriding a pending intention", async () => {
    const { rendered } = setup();
    act(() =>
      rendered.result.current.activate({ control: "target", op: "increment" }),
    );
    rendered.rerender({
      device: makeDevice({ temperature_setpoint: { current_value: 19 } }),
    });
    expect(rendered.result.current.readControl("target")).toMatchObject({
      reported: 19,
      displayed: 21.5,
    });
    expect(rendered.result.current.reported("temperature_setpoint")).toBe(19);
  });

  it("drops pending intentions when the device changes", async () => {
    const { rendered } = setup();
    act(() =>
      rendered.result.current.activate({ control: "target", op: "increment" }),
    );
    rendered.rerender({ device: { ...makeDevice(), id: "dev-2" } as Device });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mockSendCommand).not.toHaveBeenCalled();
    expect(rendered.result.current.readControl("target")?.pending).toBe(false);
  });
});
