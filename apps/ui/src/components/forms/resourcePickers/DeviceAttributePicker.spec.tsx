import * as React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Device } from "@/api/devices";
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

vi.mock("@/api/devices", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/devices")>("@/api/devices");
  return {
    ...actual,
    listDevices: (...args: unknown[]) => mockListDevices(...args),
    getDevice: (...args: unknown[]) => mockGetDevice(...args),
  };
});

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
    driverId: "drv-1",
    transportId: "tp-1",
    config: {},
    attributes: {
      temperature: {
        kind: "standard",
        name: "temperature",
        dataType: "float",
        readWriteModes: ["read"],
        currentValue: 21.5,
        lastUpdated: null,
        lastChanged: null,
      },
      temperatureSetpoint: {
        kind: "standard",
        name: "temperatureSetpoint",
        dataType: "float",
        readWriteModes: ["read", "write"],
        currentValue: 22,
        lastUpdated: null,
        lastChanged: null,
      },
    },
    isFaulty: false,
  },
  {
    id: "d2",
    name: "Boiler",
    type: null,
    tags: {},
    driverId: "drv-2",
    transportId: "tp-1",
    config: {},
    attributes: {
      onoffState: {
        kind: "standard",
        name: "onoffState",
        dataType: "bool",
        readWriteModes: ["read", "write"],
        currentValue: true,
        lastUpdated: null,
        lastChanged: null,
      },
    },
    isFaulty: false,
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
        attribute="temperatureSetpoint"
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

    // Both d1 and d2 happen to have onoffState in this test — wire d1 to also
    // expose it so we can verify preservation.
    const sharedAttr = devices[1].attributes.onoffState;
    const d1WithOnoff: Device = {
      ...devices[0],
      attributes: { ...devices[0].attributes, onoffState: sharedAttr },
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
        attribute="onoffState"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getAllByTestId("select")[0], {
      target: { value: "d2" },
    });

    expect(onChange).toHaveBeenCalledWith({
      deviceId: "d2",
      attribute: "onoffState",
    });
  });

  it("applies attributeFilter to the attribute list", () => {
    setupQueries(devices[0]);

    render(
      <DeviceAttributePicker
        deviceId="d1"
        attribute={undefined}
        onChange={vi.fn()}
        attributeFilter={(a) => a.readWriteModes.includes("write")}
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
