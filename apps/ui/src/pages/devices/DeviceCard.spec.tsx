import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DeviceCard } from "./DeviceCard";
import type { Device, DeviceAttribute, FaultAttribute } from "@/api/devices";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "common.severity.alert": "alert",
        "common.severity.warning": "warning",
        "common.severity.info": "info",
        "common:common.attributes": "attributes",
        "common:common.deviceTypes.unknown": "Unknown",
      };
      return map[key] ?? key;
    },
  }),
}));

const fault = (
  overrides: Partial<FaultAttribute> & {
    severity: FaultAttribute["severity"];
    isFaulty: boolean;
  },
): FaultAttribute => ({
  kind: "fault",
  name: overrides.name ?? "fault_x",
  dataType: "bool",
  readWriteModes: ["read"],
  currentValue: true,
  lastUpdated: "2026-04-22T10:00:00Z",
  lastChanged: "2026-04-22T09:00:00Z",
  ...overrides,
});

function makeDevice(
  attributes: Record<string, DeviceAttribute>,
  isFaulty = false,
): Device {
  return {
    id: "d1",
    name: "Device 1",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes,
    isFaulty,
  };
}

function renderCard(device: Device) {
  return render(
    <MemoryRouter>
      <DeviceCard device={device} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("DeviceCard", () => {
  it("renders the device name", () => {
    renderCard(makeDevice({}));
    expect(screen.getByText("Device 1")).toBeInTheDocument();
  });

  it("does not render a severity icon when the device has no active faults", () => {
    renderCard(makeDevice({}));
    expect(screen.queryByLabelText("alert")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("warning")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("info")).not.toBeInTheDocument();
  });

  it("does not render a severity icon when fault attributes are healthy", () => {
    const device = makeDevice({
      a: fault({ name: "a", severity: "alert", isFaulty: false }),
    });
    renderCard(device);
    expect(screen.queryByLabelText("alert")).not.toBeInTheDocument();
  });

  it("renders the highest active severity icon (alert wins over warning and info)", () => {
    const device = makeDevice(
      {
        i: fault({ name: "i", severity: "info", isFaulty: true }),
        a: fault({ name: "a", severity: "alert", isFaulty: true }),
        w: fault({ name: "w", severity: "warning", isFaulty: true }),
      },
      true,
    );
    renderCard(device);
    const icon = screen.getByLabelText("alert");
    expect(icon).toHaveAttribute("data-severity", "alert");
    expect(screen.queryByLabelText("warning")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("info")).not.toBeInTheDocument();
  });

  it("renders warning icon when only warning + info are active", () => {
    const device = makeDevice(
      {
        w: fault({ name: "w", severity: "warning", isFaulty: true }),
        i: fault({ name: "i", severity: "info", isFaulty: true }),
      },
      true,
    );
    renderCard(device);
    expect(screen.getByLabelText("warning")).toHaveAttribute(
      "data-severity",
      "warning",
    );
  });

  it("renders info icon when only info is active", () => {
    const device = makeDevice(
      {
        i: fault({ name: "i", severity: "info", isFaulty: true }),
      },
      true,
    );
    renderCard(device);
    expect(screen.getByLabelText("info")).toHaveAttribute(
      "data-severity",
      "info",
    );
  });
});
