import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ActiveFaultsSection } from "./ActiveFaultsSection";
import type { Device, DeviceAttribute } from "@/api/devices";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { ago?: string; count?: number }) => {
      const map: Record<string, string> = {
        "deviceDetails.activeFaults.title": "Active faults",
        "deviceDetails.activeFaults.empty": "No active faults.",
        "common.severity.alert": "alert",
        "common.severity.warning": "warning",
        "common.severity.info": "info",
        "common.faults.ok": "OK",
        "common.timeAgo.justNow": "just now",
      };
      if (map[key]) return map[key];
      if (key === "common.faults.activeSince")
        return `Active since ${opts?.ago ?? ""}`;
      if (key === "common.timeAgo.minutes") return `${opts?.count} minutes`;
      if (key === "common.timeAgo.hours") return `${opts?.count} hours`;
      if (key === "common.timeAgo.days") return `${opts?.count} days`;
      return key;
    },
  }),
}));

const plain: DeviceAttribute = {
  name: "temperature",
  dataType: "float",
  readWriteModes: ["read"],
  currentValue: 21.5,
  lastUpdated: "2026-04-22T10:00:00Z",
  lastChanged: "2026-04-22T09:00:00Z",
};

const fault = (overrides: Partial<DeviceAttribute>): DeviceAttribute => ({
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
    name: "Device 1",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes,
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
  it("renders the section title", () => {
    render(<ActiveFaultsSection device={makeDevice({})} />);
    expect(screen.getByText("Active faults")).toBeInTheDocument();
  });

  it("renders empty state when device has no fault-kind attributes", () => {
    render(<ActiveFaultsSection device={makeDevice({ temperature: plain })} />);
    expect(screen.getByText("No active faults.")).toBeInTheDocument();
    expect(screen.queryByText(/alert|warning|info/)).not.toBeInTheDocument();
  });

  it("renders empty state when fault attributes exist but none are active", () => {
    const device = makeDevice({
      a: fault({ name: "a", severity: "alert", isFaulty: false }),
      b: fault({ name: "b", severity: "warning", isFaulty: false }),
    });
    render(<ActiveFaultsSection device={device} />);
    expect(screen.getByText("No active faults.")).toBeInTheDocument();
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
    expect(screen.getByText("Alarm")).toBeInTheDocument();
    expect(screen.queryByText("Temperature")).not.toBeInTheDocument();
  });
});
