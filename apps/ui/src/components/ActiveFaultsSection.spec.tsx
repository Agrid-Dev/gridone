import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { ActiveFaultsSection } from "./ActiveFaultsSection";
import {
  DeviceKind,
  type Device,
  type DeviceAttribute,
  type FaultAttribute,
} from "@/api/devices";

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.activeFaults.badge": "{{count}} active faults",
    "deviceDetails.activeFaults.expand": "Show details",
    "deviceDetails.activeFaults.collapse": "Hide details",
    "deviceDetails.activeFaults.empty": "No active faults.",
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
    "common.faults.ok": "OK",
    "common.faults.activeSince": "Active for {{ago}}",
    "common.duration.lessThanAMinute": "less than a minute",
    "common.duration.minutes": "{{count}} minutes",
    "common.duration.hours": "{{count}} hours",
    "common.duration.days": "{{count}} days",
  }),
);

const plain: DeviceAttribute = {
  kind: "standard",
  name: "temperature",
  dataType: "float",
  readWriteModes: ["read"],
  currentValue: 21.5,
  lastUpdated: "2026-04-22T10:00:00Z",
  lastChanged: "2026-04-22T09:00:00Z",
};

const fault = (
  overrides: Partial<FaultAttribute> & {
    severity: FaultAttribute["severity"];
    isFaulty: boolean;
  },
): FaultAttribute => ({
  kind: "fault",
  name: "fault_x",
  dataType: "bool",
  readWriteModes: ["read"],
  currentValue: true,
  lastUpdated: "2026-04-22T10:00:00Z",
  lastChanged: "2026-04-22T10:00:00Z",
  ...overrides,
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
  vi.setSystemTime(new Date("2026-04-22T10:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ActiveFaultsSection", () => {
  it("renders nothing when device has no fault-kind attributes", () => {
    const { container } = render(
      <ActiveFaultsSection device={makeDevice({ temperature: plain })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when fault attributes exist but none are active", () => {
    const device = makeDevice({
      a: fault({ name: "a", severity: "alert", isFaulty: false }),
      b: fault({ name: "b", severity: "warning", isFaulty: false }),
    });
    const { container } = render(<ActiveFaultsSection device={device} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the fault count tinted by the most severe fault, collapsed by default", () => {
    const { container } = render(
      <ActiveFaultsSection
        device={makeDevice({
          a: fault({ name: "warn_fault", severity: "warning", isFaulty: true }),
          b: fault({ name: "alert_fault", severity: "alert", isFaulty: true }),
        })}
      />,
    );

    expect(screen.getByText("2 active faults")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute(
      "data-severity",
      "alert",
    );
    // Collapsed: the fault list is not rendered
    expect(screen.queryByText("Alert Fault")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Show details/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("expands to the fault list and collapses back", () => {
    render(
      <ActiveFaultsSection
        device={makeDevice({
          a: fault({ name: "alert_fault", severity: "alert", isFaulty: true }),
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Show details/ }));
    expect(screen.getByText("Alert Fault")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Hide details/ }));
    expect(screen.queryByText("Alert Fault")).not.toBeInTheDocument();
  });

  it("renders active faults sorted by severity desc (alert → warning → info)", () => {
    const tenMinAgo = new Date(
      Date.parse("2026-04-22T10:00:00Z") - 10 * 60_000,
    ).toISOString();
    const device = makeDevice({
      infoFault: fault({
        name: "info_fault",
        severity: "info",
        isFaulty: true,
        lastChanged: tenMinAgo,
      }),
      alertFault: fault({
        name: "alert_fault",
        severity: "alert",
        isFaulty: true,
        lastChanged: tenMinAgo,
      }),
      warnFault: fault({
        name: "warn_fault",
        severity: "warning",
        isFaulty: true,
        lastChanged: tenMinAgo,
      }),
    });
    render(<ActiveFaultsSection device={device} />);

    fireEvent.click(screen.getByRole("button", { name: /Show details/ }));

    expect(screen.queryByText("No active faults.")).not.toBeInTheDocument();

    const labels = screen.getAllByText(/Fault$/);
    expect(labels.map((el) => el.textContent)).toEqual([
      "Alert Fault",
      "Warn Fault",
      "Info Fault",
    ]);
  });

  it("within same severity, newer lastChanged renders first", () => {
    const older = new Date(
      Date.parse("2026-04-22T10:00:00Z") - 60 * 60_000,
    ).toISOString();
    const newer = new Date(
      Date.parse("2026-04-22T10:00:00Z") - 5 * 60_000,
    ).toISOString();
    const device = makeDevice({
      older: fault({
        name: "older_fault",
        severity: "alert",
        isFaulty: true,
        lastChanged: older,
      }),
      newer: fault({
        name: "newer_fault",
        severity: "alert",
        isFaulty: true,
        lastChanged: newer,
      }),
    });
    render(<ActiveFaultsSection device={device} />);

    fireEvent.click(screen.getByRole("button", { name: /Show details/ }));

    const labels = screen.getAllByText(/Fault$/);
    expect(labels.map((el) => el.textContent)).toEqual([
      "Newer Fault",
      "Older Fault",
    ]);
  });

  it("does not render plain (non-fault) attributes", () => {
    const device = makeDevice({
      temp: plain,
      alarm: fault({
        name: "alarm",
        severity: "alert",
        isFaulty: true,
      }),
    });
    render(<ActiveFaultsSection device={device} />);
    fireEvent.click(screen.getByRole("button", { name: /Show details/ }));
    expect(screen.getByText("Alarm")).toBeInTheDocument();
    expect(screen.queryByText("Temperature")).not.toBeInTheDocument();
  });
});
