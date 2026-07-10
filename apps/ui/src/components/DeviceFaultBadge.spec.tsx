import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceFaultBadge } from "./DeviceFaultBadge";
import type { Device } from "@gridone/sdk";
import type { DeviceAttribute } from "@/lib/devices";
import type { AttributeFields, FaultAttribute } from "@/lib/faults";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.activeFaults.badge_one": "{{count}} active fault",
    "deviceDetails.activeFaults.badge_other": "{{count}} active faults",
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
  }),
);

const plain: AttributeFields = {
  kind: "standard",
  name: "temperature",
  data_type: "float",
  read_write_modes: ["read"],
  current_value: 21.5,
  last_updated: null,
  last_changed: null,
};

function fault(
  name: string,
  severity: FaultAttribute["severity"],
  isFaulty: boolean,
): FaultAttribute {
  return {
    kind: "fault",
    name,
    data_type: "bool",
    read_write_modes: ["read"],
    current_value: isFaulty,
    last_updated: null,
    last_changed: null,
    severity,
    is_faulty: isFaulty,
  };
}

function makeDevice(attributes: Record<string, DeviceAttribute>): Device {
  return {
    id: "d1",
    name: "Device 1",
    type: null,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes,
    is_faulty: false,
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
