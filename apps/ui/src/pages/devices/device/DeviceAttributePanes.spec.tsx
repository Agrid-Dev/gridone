import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceAttributePanes } from "./DeviceAttributePanes";
import {
  DeviceKind,
  type Device,
  type DeviceAttribute,
  type FaultAttribute,
} from "@/api/devices";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.panes.standard": "Standard",
    "deviceDetails.panes.faults": "Faults",
    "deviceDetails.panes.internal": "Internal",
    "deviceDetails.attributeTable.name": "Name",
    "deviceDetails.attributeTable.type": "Type",
    "deviceDetails.attributeTable.mode": "Mode",
    "deviceDetails.attributeTable.value": "Value",
    "deviceDetails.attributeTable.updated": "Updated",
    "deviceDetails.attributeTable.readOnly": "R",
    "deviceDetails.attributeTable.readWrite": "R-W",
    "deviceDetails.connectionStatus.ok": "Connected",
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
    "common.timeAgo.justNow": "just now",
    "common.timeAgo.minutes": "{{count}} minutes",
    "common.timeAgo.hours": "{{count}} hours",
    "common.timeAgo.days": "{{count}} days",
  }),
);

const NOW = "2026-04-22T10:00:00Z";

const attr = (
  over: Partial<DeviceAttribute> & { name: string },
): DeviceAttribute => ({
  kind: "standard",
  dataType: "float",
  readWriteModes: ["read"],
  currentValue: 21.5,
  lastUpdated: "2026-04-22T09:58:00Z",
  lastChanged: null,
  ...over,
});

const faultAttr = (
  over: Partial<FaultAttribute> & {
    name: string;
    severity: FaultAttribute["severity"];
    isFaulty: boolean;
  },
): FaultAttribute => ({
  kind: "fault",
  dataType: "bool",
  readWriteModes: ["read"],
  currentValue: true,
  lastUpdated: "2026-04-22T09:55:00Z",
  lastChanged: "2026-04-22T09:55:00Z",
  ...over,
});

function makeDevice(attributes: Record<string, DeviceAttribute>): Device {
  return {
    id: "d1",
    kind: DeviceKind.Physical,
    name: "Device 1",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes,
    isFaulty: false,
  };
}

beforeEach(() => {
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DeviceAttributePanes", () => {
  it("renders only non-empty panes, ordered Standard · Faults · Internal", () => {
    const device = makeDevice({
      temperature: attr({ name: "temperature" }),
      highTempAlarm: faultAttr({
        name: "high_temp_alarm",
        severity: "alert",
        isFaulty: true,
      }),
      connectionStatus: attr({
        name: "connectionStatus",
        kind: "internal",
        dataType: "str",
        currentValue: "ok",
      }),
    });
    render(<DeviceAttributePanes device={device} />);

    const titles = screen.getAllByText(/^(Standard|Faults|Internal)$/);
    expect(titles.map((el) => el.textContent)).toEqual([
      "Standard",
      "Faults",
      "Internal",
    ]);
  });

  it("hides a pane with no rows", () => {
    const device = makeDevice({
      temperature: attr({ name: "temperature" }),
    });
    render(<DeviceAttributePanes device={device} />);

    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.queryByText("Faults")).not.toBeInTheDocument();
    expect(screen.queryByText("Internal")).not.toBeInTheDocument();
  });

  it("shows name, type, mode and relative last-updated for each row", () => {
    const device = makeDevice({
      temperature: attr({ name: "temperature", currentValue: 21.5 }),
      setpoint: attr({
        name: "setpoint",
        readWriteModes: ["read", "write"],
        currentValue: 19,
      }),
    });
    render(<DeviceAttributePanes device={device} />);

    const tempRow = screen.getByText("Temperature").closest("tr")!;
    expect(within(tempRow).getByText("float")).toBeInTheDocument();
    expect(within(tempRow).getByText("R")).toBeInTheDocument();
    expect(within(tempRow).getByText("21.5")).toBeInTheDocument();
    expect(within(tempRow).getByText("2 minutes")).toBeInTheDocument();

    const setpointRow = screen.getByText("Setpoint").closest("tr")!;
    expect(within(setpointRow).getByText("R-W")).toBeInTheDocument();
  });

  it("renders faulty rows distinctly with a severity chip", () => {
    const device = makeDevice({
      alarm: faultAttr({
        name: "high_temp_alarm",
        severity: "alert",
        isFaulty: true,
      }),
    });
    render(<DeviceAttributePanes device={device} />);

    const row = screen.getByText("High Temp Alarm").closest("tr")!;
    expect(row).toHaveAttribute("data-faulty");
    expect(within(row).getByText("alert")).toBeInTheDocument();
  });

  it("renders the connection status badge in the Internal pane", () => {
    const device = makeDevice({
      connectionStatus: attr({
        name: "connectionStatus",
        kind: "internal",
        dataType: "str",
        currentValue: "ok",
      }),
    });
    render(<DeviceAttributePanes device={device} />);

    // Only the Internal pane is present, so the badge necessarily renders there.
    expect(screen.getByText("Internal")).toBeInTheDocument();
    const row = screen.getByText("Connection Status").closest("tr")!;
    expect(within(row).getByText("Connected")).toBeInTheDocument();
  });
});
