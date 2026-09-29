import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

/** Whether the viewer holds the permission that shows connection status. */
const permissions = vi.hoisted(() => ({ granted: true }));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => permissions.granted,
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.activeFaults.badge": "{{count}} fault(s)",
    "devices.card.lead.setpoint": "setpoint",
    "devices.card.lead.measured": "measured",
    "devices.card.lead.power": "power",
    "thermostat.name": "Thermostat",
    "electricity_meter.name": "Electricity meter",
    "other.name": "Other",
    "deviceDetails.connectionStatus.ok": "Connected",
    "deviceDetails.connectionStatus.idle": "Idle",
    "deviceDetails.connectionStatus.degraded": "Degraded",
    "deviceDetails.connectionStatus.error": "Disconnected",
    "devices.card.pms.status.booked": "Booked",
    "devices.card.pms.status.checkedIn": "Occupied",
    "devices.card.pms.status.checkedOut": "Available",
    "devices.card.pms.status.unknown": "Status unavailable",
    "devices.card.pms.guests": "{{count}} guests",
    "devices.card.pms.guestCountUnavailable": "Guest count unavailable",
    "devices.card.pms.nextArrival": "Next arrival: {{date}}",
    "devices.card.pms.noUpcomingArrival": "No upcoming arrival",
    "common.hvacMode.heat": "Heating",
    "common.hvacMode.off": "Off",
    "common:common.severityCount.alert": "{{count}} alert(s)",
    "devices.card.lead.runState.running": "Running",
    "devices.card.lead.runState.stopped": "Stopped",
    "devices.card.lead.runState.unknown": "Not reported",
    "pump.name": "Pump",
  }),
);

import { DeviceFleetCard } from "./DeviceFleetCard";

const attr = (value: unknown) => ({ current_value: value });

const fault = (severity: "alert" | "warning" | "info") => ({
  kind: "fault",
  name: `${severity}_fault`,
  severity,
  is_faulty: true,
  current_value: true,
});

function thermostat(attributes: Record<string, unknown> = {}): Device {
  return {
    id: "d1",
    name: "Ch. 201",
    type: "thermostat",
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes,
    is_faulty: false,
  } as Device;
}

function pmsMonitor(attributes: Record<string, unknown> = {}): Device {
  return {
    ...thermostat(attributes),
    id: "pms-1",
    name: "Room 1",
    type: "pms_monitor",
  } as Device;
}

function renderCard(device: Device, zonePath: string | null = "Floor 2") {
  return render(
    <MemoryRouter>
      <DeviceFleetCard device={device} zonePath={zonePath} />
    </MemoryRouter>,
  );
}

/** The card's outline carrier, and its type tile. */
const card = (container: HTMLElement) =>
  container.querySelector(".rounded-lg") as HTMLElement;
const tile = (container: HTMLElement) =>
  container.querySelector("[data-activity]") as HTMLElement;

const heating = {
  temperature: attr(21.4),
  temperature_setpoint: attr(21),
  mode: attr("heat"),
  onoff_state: attr(true),
};

afterEach(() => {
  cleanup();
  permissions.granted = true;
});

describe("DeviceFleetCard", () => {
  it("leads with the setpoint, the measured reading under it", () => {
    renderCard(thermostat(heating));
    expect(screen.getByText("21,0°")).toBeInTheDocument();
    expect(screen.getByText("setpoint")).toBeInTheDocument();
    expect(screen.getByText("21,4°")).toBeInTheDocument();
    expect(screen.getByText("measured")).toBeInTheDocument();
  });

  it.each([true, false])(
    "shows N/A for a fan-mode setpoint when power is %s",
    (on) => {
      renderCard(
        thermostat({
          temperature: attr(21.5),
          temperature_setpoint: attr(0),
          mode: attr("fan"),
          onoff_state: attr(on),
        }),
      );
      expect(screen.getByText("N/A")).toBeInTheDocument();
      expect(screen.getByText("setpoint")).toBeInTheDocument();
      expect(screen.queryByText("0,0°")).not.toBeInTheDocument();
      expect(screen.getByText("21,5°")).toBeInTheDocument();
      expect(screen.getByText("measured")).toBeInTheDocument();
    },
  );

  it("falls back to the measure when the device has no setpoint", () => {
    renderCard(thermostat({ temperature: attr(21.4) }));
    expect(screen.getByText("21,4°")).toBeInTheDocument();
    expect(screen.getByText("measured")).toBeInTheDocument();
    expect(screen.queryByText("setpoint")).not.toBeInTheDocument();
  });

  it("says nothing about faults while none is active", () => {
    renderCard(thermostat({ temperature: attr(21.4) }));
    expect(screen.queryByText(/fault/)).not.toBeInTheDocument();
  });

  it("counts the faults at the highest active severity", () => {
    renderCard(
      thermostat({ comm_fault: fault("alert"), minor_fault: fault("warning") }),
    );
    expect(screen.getByText("2 fault(s)")).toBeInTheDocument();
  });

  describe("type and location", () => {
    it("writes the type under the name, then where the device sits", () => {
      renderCard(thermostat(heating));
      const caption = screen.getByText("Thermostat").closest("p");
      expect(caption).toHaveTextContent(/^Thermostat · Floor 2$/);
      expect(caption?.closest("h3")).toBeNull();
    });

    it("writes the type alone for a device with no placement", () => {
      renderCard(thermostat(heating), null);
      const caption = screen.getByText("Thermostat").closest("p");
      expect(caption).toHaveTextContent(/^Thermostat$/);
    });

    it.each([
      ["an untyped device, as other", null, "Other"],
      [
        "a type the UI does not know, by its wire name",
        "vendor_box",
        "vendor_box",
      ],
    ])("names %s", (_, type, name) => {
      renderCard({ ...thermostat(), type } as Device, null);
      expect(screen.getByText(name).closest("p")).toHaveTextContent(
        new RegExp(`^${name}$`),
      );
    });

    it("keeps the type tile decorative — the type is written beside it", () => {
      const { container } = renderCard(thermostat(heating));
      expect(tile(container)).toHaveAttribute("aria-hidden", "true");
      expect(screen.queryAllByRole("img")).toHaveLength(0);
    });

    it("gives a device of no registered type a dashed tile — nothing to judge by", () => {
      const { container } = renderCard({
        ...thermostat(),
        type: null,
      } as Device);
      expect(tile(container)).toHaveAttribute("data-activity", "unknown");
    });
  });

  describe("outline", () => {
    it("rings a running unit in green, 1.5 px", () => {
      const { container } = renderCard(thermostat(heating));
      expect(card(container)).toHaveAttribute("data-outline", "running");
      expect(card(container)).toHaveClass(
        "border-status-ok/60",
        "ring-[0.5px]",
        "ring-status-ok/60",
      );
    });

    it("rings a running pump in green, whose lead words the state", () => {
      const { container } = renderCard({
        ...thermostat({ onoff_state: attr(true) }),
        type: "pump",
      } as Device);
      expect(card(container)).toHaveAttribute("data-outline", "running");
    });

    it.each([
      ["a stopped unit", thermostat({ ...heating, onoff_state: attr(false) })],
      [
        "a unit that reports no run state",
        thermostat({ temperature: attr(21) }),
      ],
      [
        "a reporting sensor — nothing to run",
        {
          ...thermostat({ active_power: attr(240) }),
          type: "electricity_meter",
        } as Device,
      ],
    ])("leaves %s on the neutral hairline", (_, device) => {
      const { container } = renderCard(device);
      expect(card(container)).not.toHaveAttribute("data-outline");
      expect(card(container)).not.toHaveClass("ring-[0.5px]");
      expect(card(container)).not.toHaveClass("border-dashed");
    });

    it.each([
      ["alert", "border-status-error/60", "ring-status-error/60"],
      ["warning", "border-status-warning/60", "ring-status-warning/60"],
      ["info", "border-status-info/60", "ring-status-info/60"],
    ] as const)(
      "gives a running unit's %s fault the outline over the green",
      (severity, border, ring) => {
        const { container } = renderCard(
          thermostat({ ...heating, some_fault: fault(severity) }),
        );
        expect(card(container)).toHaveAttribute("data-outline", severity);
        expect(card(container)).toHaveClass(border, "ring-[0.5px]", ring);
        expect(card(container)).not.toHaveClass("border-status-ok/60");
      },
    );

    it("outlines a stopped unit's fault too", () => {
      const { container } = renderCard(
        thermostat({
          ...heating,
          onoff_state: attr(false),
          some_fault: fault("warning"),
        }),
      );
      expect(card(container)).toHaveAttribute("data-outline", "warning");
    });

    it("keeps the green of a running unit whose link is degraded", () => {
      const { container } = renderCard(
        thermostat({ ...heating, connection_status: attr("degraded") }),
      );
      expect(card(container)).toHaveAttribute("data-outline", "running");
    });
  });

  describe("connection", () => {
    it.each([
      ["connected", "ok"],
      ["waiting for its first reading", "idle"],
    ])("says nothing of a device %s", (_, status) => {
      renderCard(thermostat({ ...heating, connection_status: attr(status) }));
      expect(screen.queryByText("Connected")).not.toBeInTheDocument();
      expect(screen.queryByText("Idle")).not.toBeInTheDocument();
    });

    it("writes a degraded link beside the name, and keeps the card live", () => {
      renderCard(
        thermostat({ ...heating, connection_status: attr("degraded") }),
      );
      expect(screen.getByText("Degraded")).toHaveClass("text-status-warning");
      expect(screen.getByText("21,0°")).not.toHaveClass(
        "text-muted-foreground",
      );
      expect(screen.getByText("Heating")).toBeInTheDocument();
    });

    describe("disconnected", () => {
      const disconnected = { ...heating, connection_status: attr("error") };

      it("says so beside the name", () => {
        renderCard(thermostat(disconnected));
        const label = screen.getByText("Disconnected");
        expect(label).toHaveClass("text-status-error");
        expect(label.closest("h3")).toBeNull();
        expect(label.parentElement).toHaveTextContent("Ch. 201");
      });

      it("dashes the outline — no green for a state it no longer reports", () => {
        const { container } = renderCard(thermostat(disconnected));
        expect(card(container)).not.toHaveAttribute("data-outline");
        expect(card(container)).toHaveClass(
          "border-dashed",
          "border-muted-foreground/40",
        );
        expect(card(container)).not.toHaveClass("ring-[0.5px]");
      });

      it("keeps a fault's colour on the dashed outline, without the ring", () => {
        const { container } = renderCard(
          thermostat({ ...disconnected, some_fault: fault("alert") }),
        );
        expect(card(container)).toHaveAttribute("data-outline", "alert");
        expect(card(container)).toHaveClass(
          "border-dashed",
          "border-status-error/60",
        );
        expect(card(container)).not.toHaveClass("ring-[0.5px]");
        expect(screen.getByText("1 fault(s)")).toBeInTheDocument();
      });

      it("greys its last values, drops the status line, dashes the tile", () => {
        const { container } = renderCard(thermostat(disconnected));
        expect(screen.getByText("21,0°")).toHaveClass("text-muted-foreground");
        expect(screen.getByText("21,4°")).toHaveClass("text-muted-foreground");
        expect(screen.queryByText("Heating")).not.toBeInTheDocument();
        expect(container.querySelector("[data-run]")).toBeNull();
        expect(tile(container)).toHaveAttribute("data-activity", "unknown");
      });

      it("reads as connected for a viewer who may not see connection status", () => {
        permissions.granted = false;
        const { container } = renderCard(thermostat(disconnected));
        expect(screen.queryByText("Disconnected")).not.toBeInTheDocument();
        expect(card(container)).toHaveAttribute("data-outline", "running");
        expect(card(container)).not.toHaveClass("border-dashed");
        expect(screen.getByText("21,0°")).not.toHaveClass(
          "text-muted-foreground",
        );
        expect(screen.getByText("Heating")).toBeInTheDocument();
      });
    });
  });

  describe("status line", () => {
    it("words a running unit's mode, its marker in the mode's colour", () => {
      const { container } = renderCard(thermostat(heating));
      expect(screen.getByText("Heating")).toBeInTheDocument();
      expect(tile(container)).toHaveAttribute("data-activity", "running");
      const marker = container.querySelector('[data-run="running"] > span');
      expect(marker).toHaveClass("bg-hvac-heat");
    });

    it("says a stopped unit is stopped, not the mode it is set to", () => {
      const { container } = renderCard(
        thermostat({ ...heating, onoff_state: attr(false) }),
      );
      expect(screen.getByText("Stopped")).toBeInTheDocument();
      expect(screen.queryByText("Heating")).not.toBeInTheDocument();
      expect(tile(container)).toHaveAttribute("data-activity", "idle");
    });

    it("greys the setpoint of a stopped unit, not the measure", () => {
      renderCard(thermostat({ ...heating, onoff_state: attr(false) }));
      expect(screen.getByText("21,0°")).toHaveClass("text-muted-foreground");
      expect(screen.getByText("21,4°")).not.toHaveClass(
        "text-muted-foreground",
      );
    });

    it("keeps the setpoint of a running unit in the foreground", () => {
      renderCard(thermostat(heating));
      expect(screen.getByText("21,0°")).not.toHaveClass(
        "text-muted-foreground",
      );
    });

    it("keeps the setpoint of a unit that reports no run state in the foreground — only idle greys it", () => {
      const { container } = renderCard(
        thermostat({ temperature: attr(21.4), temperature_setpoint: attr(21) }),
      );
      expect(tile(container)).toHaveAttribute("data-activity", "unknown");
      expect(screen.getByText("21,0°")).not.toHaveClass(
        "text-muted-foreground",
      );
    });

    it.each<[string, string, boolean]>([
      ["a stopped thermostat, beside its run state", "thermostat", true],
      ["a stopped pump, whose lead already words its state", "pump", false],
    ])("carries the fault badge of %s", (_, type, hasRunStatus) => {
      const { container } = renderCard({
        ...thermostat({
          onoff_state: attr(false),
          comm_fault: fault("warning"),
        }),
        type,
      } as Device);
      const line = container.querySelector(".border-t") as HTMLElement;
      expect(within(line).getByRole("link", { name: /fault/ })).toHaveAttribute(
        "href",
        "/devices/d1#active-faults",
      );
      expect(line.querySelector("[data-run]") !== null).toBe(hasRunStatus);
    });

    it("says a unit that reports no run state is not reported", () => {
      const { container } = renderCard(thermostat({ temperature: attr(21.4) }));
      expect(screen.getByText("Not reported")).toBeInTheDocument();
      expect(tile(container)).toHaveAttribute("data-activity", "unknown");
    });

    it("is left out when the lead already words the state and no fault is active", () => {
      const { container } = renderCard({
        ...thermostat({ onoff_state: attr(true) }),
        type: "pump",
      } as Device);
      expect(tile(container)).toHaveAttribute("data-activity", "running");
      expect(container.querySelector("[data-run]")).toBeNull();
      expect(container.querySelector(".border-t")).toBeNull();
    });

    it("carries the fault badge beside the mode", () => {
      const { container } = renderCard(
        thermostat({ ...heating, comm_fault: fault("alert") }),
      );
      const line = container.querySelector(".border-t") as HTMLElement;
      expect(line).toHaveTextContent("Heating");
      expect(line).toHaveTextContent("1 fault(s)");
    });
  });

  it("leads with a dash for a device of no registered type", () => {
    renderCard({ ...thermostat(), type: "custom_vendor" } as Device);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("links the whole card to the device detail", () => {
    renderCard(thermostat());
    expect(screen.getByRole("link")).toHaveAttribute("href", "/devices/d1");
  });

  it("keeps the fault badge as its own link to the active faults", () => {
    renderCard(thermostat({ comm_fault: fault("alert") }));
    expect(screen.getByRole("link", { name: "Ch. 201" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
    expect(screen.getByRole("link", { name: /fault/ })).toHaveAttribute(
      "href",
      "/devices/d1#active-faults",
    );
  });

  it("lifts the fault badge above the card's stretched link", () => {
    // jsdom does no hit-testing: the stacking class is the contract that
    // keeps the badge clickable over the card-wide `after:` overlay.
    renderCard(thermostat({ comm_fault: fault("alert") }));
    expect(
      screen.getByRole("link", { name: /fault/ }).parentElement,
    ).toHaveClass("z-10");
  });

  describe("PMS monitor summary", () => {
    it("shows the reservation status and current guest count", () => {
      renderCard(
        pmsMonitor({
          reservation_status: attr("checked_in"),
          guest_count: attr(2),
          next_arrival_at: attr("2026-08-15T14:00:00"),
        }),
      );

      expect(screen.getByText("Occupied")).toBeInTheDocument();
      expect(screen.getByText("2 guests")).toBeInTheDocument();
      expect(screen.queryByText(/Next arrival/)).not.toBeInTheDocument();
    });

    it("shows the next arrival for an available room", () => {
      const nextArrival = "2026-08-12T15:00:00";
      const formattedArrival = new Intl.DateTimeFormat("fr", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(nextArrival));

      renderCard(
        pmsMonitor({
          reservation_status: attr("checked_out"),
          guest_count: attr(0),
          next_arrival_at: attr(nextArrival),
        }),
      );

      expect(screen.getByText("Available")).toBeInTheDocument();
      expect(
        screen.getByText(`Next arrival: ${formattedArrival}`),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    });

    it("handles missing reservation data without an empty card", () => {
      renderCard(pmsMonitor());

      expect(screen.getByText("Status unavailable")).toBeInTheDocument();
      expect(screen.getByText("No upcoming arrival")).toBeInTheDocument();
    });
  });
});
