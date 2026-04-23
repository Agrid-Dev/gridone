import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FaultAttributesSection } from "./FaultAttributesSection";
import type { Device, DeviceAttribute, FaultAttribute } from "@/api/devices";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { ago?: string; count?: number }) => {
      const map: Record<string, string> = {
        "deviceDetails.faults.title": "Faults",
        "deviceDetails.faults.empty":
          "No fault monitoring configured for this device.",
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

describe("FaultAttributesSection", () => {
  it("renders the section title", () => {
    render(<FaultAttributesSection device={makeDevice({})} />);
    expect(screen.getByText("Faults")).toBeInTheDocument();
  });

  it("renders empty state when device has no fault-kind attributes", () => {
    render(
      <FaultAttributesSection device={makeDevice({ temperature: plain })} />,
    );
    expect(
      screen.getByText("No fault monitoring configured for this device."),
    ).toBeInTheDocument();
  });

  it("lists both active and healthy fault-kind attributes", () => {
    const device = makeDevice({
      a: fault({ name: "a_alarm", severity: "alert", isFaulty: true }),
      b: fault({ name: "b_leak", severity: "warning", isFaulty: false }),
    });
    render(<FaultAttributesSection device={device} />);
    expect(screen.getByText("A Alarm")).toBeInTheDocument();
    expect(screen.getByText("B Leak")).toBeInTheDocument();
  });

  it("orders active first (severity desc, then lastChanged desc), then healthy by name", () => {
    const device = makeDevice({
      healthyZ: fault({
        name: "z_healthy",
        severity: "alert",
        isFaulty: false,
      }),
      healthyA: fault({
        name: "a_healthy",
        severity: "info",
        isFaulty: false,
      }),
      activeInfo: fault({
        name: "c_info_active",
        severity: "info",
        isFaulty: true,
        lastChanged: "2026-04-22T09:50:00Z",
      }),
      activeAlertOld: fault({
        name: "d_alert_older",
        severity: "alert",
        isFaulty: true,
        lastChanged: "2026-04-22T08:00:00Z",
      }),
      activeAlertNew: fault({
        name: "e_alert_newer",
        severity: "alert",
        isFaulty: true,
        lastChanged: "2026-04-22T09:55:00Z",
      }),
    });
    render(<FaultAttributesSection device={device} />);

    const labels = screen.getAllByText(
      /(Alert Newer|Alert Older|Info Active|Healthy)$/,
    );
    expect(labels.map((el) => el.textContent)).toEqual([
      "E Alert Newer",
      "D Alert Older",
      "C Info Active",
      "A Healthy",
      "Z Healthy",
    ]);
  });

  it("does not render plain (non-fault) attributes", () => {
    const device = makeDevice({
      temp: plain,
      alarm: fault({ name: "alarm", severity: "alert", isFaulty: true }),
    });
    render(<FaultAttributesSection device={device} />);
    expect(screen.getByText("Alarm")).toBeInTheDocument();
    expect(screen.queryByText("Temperature")).not.toBeInTheDocument();
  });
});
