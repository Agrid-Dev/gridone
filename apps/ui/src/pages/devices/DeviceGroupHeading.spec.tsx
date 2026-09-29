import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceType } from "@/lib/devices";

/** Whether the viewer holds the permission that shows connection status. */
const permissions = vi.hoisted(() => ({ granted: true }));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => permissions.granted,
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "thermostat.name_plural": "Thermostats",
    "devices.group.running": "{{count}} running",
    "devices.group.stopped": "{{count}} stopped",
    "devices.group.faulty": "{{count}} faulty",
    "devices.summary.error": "{{count}} disconnected",
  }),
);

import { DeviceGroupHeading, DeviceGroupSummary } from "./DeviceGroupHeading";

let nextId = 0;

/** A device of `type` reporting `attributes` (a fault given whole). */
function device(
  type: string,
  attributes: Record<string, unknown>,
  severity?: "alert" | "warning" | "info",
): Device {
  nextId += 1;
  return {
    id: `d${nextId}`,
    name: `Device ${nextId}`,
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: Boolean(severity),
    attributes: {
      ...Object.fromEntries(
        Object.entries(attributes).map(([name, value]) => [
          name,
          { name, kind: "standard", current_value: value },
        ]),
      ),
      ...(severity && {
        some_fault: {
          name: "some_fault",
          kind: "fault",
          severity,
          is_faulty: true,
          current_value: true,
        },
      }),
    },
  } as unknown as Device;
}

const running = () =>
  device(DeviceType.Thermostat, { onoff_state: true, mode: "heat" });
const stopped = () =>
  device(DeviceType.Thermostat, { onoff_state: false, mode: "heat" });
const disconnected = () =>
  device(DeviceType.Thermostat, {
    onoff_state: true,
    mode: "heat",
    connection_status: "error",
  });

afterEach(() => {
  cleanup();
  permissions.granted = true;
});

describe("DeviceGroupHeading", () => {
  it("names the group and counts its devices, labelling its section", () => {
    render(
      <DeviceGroupHeading
        id="device-group-thermostat"
        typeKey={DeviceType.Thermostat}
        count={8}
      />,
    );
    const heading = screen.getByText("Thermostats");
    expect(heading).toHaveAttribute("id", "device-group-thermostat");
    expect(heading).toHaveTextContent("Thermostats8");
  });
});

describe("DeviceGroupSummary", () => {
  it("counts running and stopped units, leaving the zero counts out", () => {
    render(<DeviceGroupSummary devices={[running(), running(), stopped()]} />);
    const summary = screen.getByText("2 running").parentElement;
    expect(summary).toHaveTextContent(/^2 running · 1 stopped$/);
  });

  it("colours the disconnected count, and takes them out of running", () => {
    render(
      <DeviceGroupSummary
        devices={[running(), disconnected(), disconnected()]}
      />,
    );
    expect(screen.getByText("2 disconnected")).toHaveClass("text-status-error");
    expect(screen.getByText("1 running")).toBeInTheDocument();
  });

  it("counts no disconnection for a viewer who may not see it", () => {
    permissions.granted = false;
    render(<DeviceGroupSummary devices={[running(), disconnected()]} />);
    expect(screen.queryByText(/disconnected/)).not.toBeInTheDocument();
    expect(screen.getByText("2 running")).toBeInTheDocument();
  });

  it("colours the faulty count by the group's most severe fault", () => {
    render(
      <DeviceGroupSummary
        devices={[
          device(DeviceType.Thermostat, { onoff_state: true }, "info"),
          device(DeviceType.Thermostat, { onoff_state: false }, "alert"),
        ]}
      />,
    );
    expect(screen.getByText("2 faulty")).toHaveClass("text-status-error");
  });

  it.each([
    ["a single device, whose card says it all", [running()]],
    [
      "a group with nothing to count — sensors, all reporting",
      [
        device(DeviceType.ElectricityMeter, { active_power: 240 }),
        device(DeviceType.ElectricityMeter, { active_power: 120 }),
      ],
    ],
  ])("says nothing for %s", (_, devices) => {
    const { container } = render(<DeviceGroupSummary devices={devices} />);
    expect(container).toBeEmptyDOMElement();
  });
});
