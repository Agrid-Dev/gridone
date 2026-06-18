import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceFaultBadge } from "./DeviceFaultBadge";
import {
  DeviceKind,
  type Device,
  type DeviceAttribute,
  type FaultAttribute,
} from "@/api/devices";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.activeFaults.badge_one": "{{count}} active fault",
    "deviceDetails.activeFaults.badge_other": "{{count}} active faults",
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
  }),
);

const plain: DeviceAttribute = {
  kind: "standard",
  name: "temperature",
  dataType: "float",
  readWriteModes: ["read"],
  currentValue: 21.5,
  lastUpdated: null,
  lastChanged: null,
};

function fault(
  name: string,
  severity: FaultAttribute["severity"],
  isFaulty: boolean,
): FaultAttribute {
  return {
    kind: "fault",
    name,
    dataType: "bool",
    readWriteModes: ["read"],
    currentValue: isFaulty,
    lastUpdated: null,
    lastChanged: null,
    severity,
    isFaulty,
  };
}

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

afterEach(cleanup);

describe("DeviceFaultBadge", () => {
  it("renders nothing when there are no active faults", () => {
    const { container } = render(
      <DeviceFaultBadge
        device={makeDevice({
          temperature: plain,
          f: fault("f", "alert", false),
        })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the active-fault count coloured by the highest severity", () => {
    render(
      <DeviceFaultBadge
        device={makeDevice({
          a: fault("a", "warning", true),
          b: fault("b", "alert", true),
          c: fault("c", "info", false), // inactive → not counted
        })}
      />,
    );

    // 2 active faults, highest severity = alert.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByLabelText("alert")).toBeInTheDocument();
  });
});
