import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import type { AttributeFields } from "@/lib/faults";
import { createI18nMock } from "@/test/i18nMock";

function flattenToText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenToText).join(" ");
  if (React.isValidElement(node)) {
    return flattenToText(
      (node.props as { children?: React.ReactNode }).children,
    );
  }
  return "";
}

const { mockUseQuery, mockListDevices, mockGetDevice } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockListDevices: vi.fn(),
  mockGetDevice: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] }) => mockUseQuery(opts),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    devices: { list: mockListDevices, get: mockGetDevice },
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "pickers.device.label": "Device",
    "pickers.device.placeholder": "Select a device",
    "pickers.device.noDevices": "No devices available",
    "pickers.attribute.label": "Attribute",
    "pickers.attribute.placeholder": "Select an attribute",
    "pickers.attribute.pickDeviceFirst": "Pick a device first",
    "pickers.attribute.noMatching": "No matching attributes",
  }),
);

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="select"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{flattenToText(children)}</option>,
}));

import { DeviceAttributePicker } from "./DeviceAttributePicker";

const devices: Device[] = [
  {
    id: "d1",
    name: "Thermostat A",
    type: null,
    tags: {},
    driver_id: "drv-1",
    transport_id: "tp-1",
    config: {},
    attributes: {
      temperature: {
        kind: "standard",
        name: "temperature",
        data_type: "float",
        read_write_modes: ["read"],
        current_value: 21.5,
        last_updated: null,
        last_changed: null,
      },
      temperature_setpoint: {
        kind: "standard",
        name: "temperature_setpoint",
        data_type: "float",
        read_write_modes: ["read", "write"],
        current_value: 22,
        last_updated: null,
        last_changed: null,
      },
    },
    is_faulty: false,
  },
  {
    id: "d2",
    name: "Boiler",
    type: null,
    tags: {},
    driver_id: "drv-2",
    transport_id: "tp-1",
    config: {},
    attributes: {
      onoff_state: {
        kind: "standard",
        name: "onoff_state",
        data_type: "bool",
        read_write_modes: ["read", "write"],
        current_value: true,
        last_updated: null,
        last_changed: null,
      },
    },
    is_faulty: false,
  },
];

function setupQueries(
  currentDevice: Device | undefined,
  deviceList: Device[] = devices,
) {
  mockUseQuery.mockImplementation(
    (opts: { queryKey: unknown[]; enabled?: boolean }) => {
      if (opts.enabled === false) {
        return { data: undefined, isLoading: false };
      }
      const [, key] = opts.queryKey;
      // The list query passes a DevicesFilter (object) or undefined as key.
      if (key === undefined || (typeof key === "object" && key !== null)) {
        return { data: deviceList, isLoading: false };
      }
      // The device-by-id query passes the deviceId string.
      return { data: currentDevice, isLoading: false };
    },
  );
}

afterEach(() => {
  cleanup();
  mockUseQuery.mockReset();
  mockListDevices.mockReset();
  mockGetDevice.mockReset();
});

describe("DeviceAttributePicker", () => {
  it("prompts the user to pick a device first when no deviceId is set", () => {
    setupQueries(undefined);

    render(
      <DeviceAttributePicker
        deviceId={undefined}
        attribute={undefined}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Pick a device first")).toBeInTheDocument();
    expect(screen.getAllByTestId("select")).toHaveLength(1); // device picker only
  });

  it("populates attributes from the selected device", () => {
    setupQueries(devices[0]);

    render(
      <DeviceAttributePicker
        deviceId="d1"
        attribute={undefined}
        onChange={vi.fn()}
      />,
    );

    const selects = screen.getAllByTestId("select") as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    const attributeSelect = selects[1];
    const optionTexts = Array.from(attributeSelect.options).map(
      (o) => o.textContent,
    );
    expect(optionTexts).toEqual([
      expect.stringContaining("Temperature"),
      expect.stringContaining("Temperature Setpoint"),
    ]);
  });

  it("clears the attribute when switching to a device that lacks it", () => {
    setupQueries(devices[0]);
    const onChange = vi.fn();

    render(
      <DeviceAttributePicker
        deviceId="d1"
        attribute="temperature_setpoint"
        onChange={onChange}
      />,
    );

    const deviceSelect = screen.getAllByTestId("select")[0];
    fireEvent.change(deviceSelect, { target: { value: "d2" } });

    expect(onChange).toHaveBeenCalledWith({ deviceId: "d2", attribute: "" });
  });

  it("preserves the attribute when switching to a device that still has it", () => {
    setupQueries(devices[0]);
    const onChange = vi.fn();

    // Both d1 and d2 happen to have onoff_state in this test — wire d1 to also
    // expose it so we can verify preservation.
    const sharedAttr = devices[1].attributes!.onoff_state;
    const d1WithOnoff: Device = {
      ...devices[0],
      attributes: { ...devices[0].attributes, onoff_state: sharedAttr },
    };
    mockUseQuery.mockImplementation(
      (opts: { queryKey: unknown[]; enabled?: boolean }) => {
        if (opts.enabled === false) {
          return { data: undefined, isLoading: false };
        }
        const [, key] = opts.queryKey;
        if (key === undefined || (typeof key === "object" && key !== null)) {
          return {
            data: [d1WithOnoff, devices[1]],
            isLoading: false,
          };
        }
        return { data: d1WithOnoff, isLoading: false };
      },
    );

    render(
      <DeviceAttributePicker
        deviceId="d1"
        attribute="onoff_state"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getAllByTestId("select")[0], {
      target: { value: "d2" },
    });

    expect(onChange).toHaveBeenCalledWith({
      deviceId: "d2",
      attribute: "onoff_state",
    });
  });

  it("applies attributeFilter to the attribute list", () => {
    setupQueries(devices[0]);

    render(
      <DeviceAttributePicker
        deviceId="d1"
        attribute={undefined}
        onChange={vi.fn()}
        attributeFilter={(a) =>
          (a as AttributeFields).read_write_modes.includes("write")
        }
      />,
    );

    const attributeSelect = screen.getAllByTestId(
      "select",
    )[1] as HTMLSelectElement;
    const optionTexts = Array.from(attributeSelect.options).map(
      (o) => o.textContent,
    );
    expect(optionTexts).toHaveLength(1);
    expect(optionTexts[0]).toContain("Temperature Setpoint");
  });
});
