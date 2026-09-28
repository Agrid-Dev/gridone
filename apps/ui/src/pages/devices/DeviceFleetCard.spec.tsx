import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "deviceDetails.activeFaults.badge": "{{count}} fault(s)",
    "devices.card.lead.setpoint": "setpoint",
    "devices.card.lead.measured": "measured",
    "thermostat.name": "Thermostat",
    "other.name": "Other",
    "deviceDetails.connectionStatus.ok": "Connected",
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
  }),
);

import { DeviceFleetCard } from "./DeviceFleetCard";

const attr = (value: unknown) => ({ current_value: value });

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

afterEach(cleanup);

describe("DeviceFleetCard", () => {
  it("leads with the setpoint, the measured reading under it", () => {
    renderCard(
      thermostat({
        temperature: attr(21.4),
        temperature_setpoint: attr(21),
        mode: attr("heat"),
        onoff_state: attr(true),
      }),
    );
    expect(screen.getByText("21,0°")).toBeInTheDocument();
    expect(screen.getByText("setpoint")).toBeInTheDocument();
    expect(screen.getByText("21,4°")).toBeInTheDocument();
    expect(screen.getByText("measured")).toBeInTheDocument();
    expect(screen.getByText("Floor 2")).toBeInTheDocument();
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
      thermostat({
        comm_fault: {
          kind: "fault",
          name: "comm_fault",
          severity: "alert",
          is_faulty: true,
          current_value: true,
        },
        minor_fault: {
          kind: "fault",
          name: "minor_fault",
          severity: "warning",
          is_faulty: true,
          current_value: true,
        },
      }),
    );
    expect(screen.getByText("2 fault(s)")).toBeInTheDocument();
  });

  it("names the connection status on its corner dot", () => {
    renderCard(thermostat({ connection_status: attr("ok") }));
    expect(screen.getByRole("img", { name: "Connected" })).toBeInTheDocument();
  });

  it("drops the zone line when the device has no placement", () => {
    renderCard(thermostat({ temperature: attr(21.4) }), null);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("shows the type glyph in front of the reading", () => {
    renderCard(thermostat({ temperature: attr(21.4) }));
    expect(screen.getByRole("img", { name: "Thermostat" })).toBeInTheDocument();
  });

  it("gives a device of no registered type the neutral glyph", () => {
    renderCard({ ...thermostat(), type: null } as Device);
    expect(screen.getByRole("img", { name: "Other" })).toBeInTheDocument();
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
    renderCard(
      thermostat({
        comm_fault: {
          kind: "fault",
          name: "comm_fault",
          severity: "alert",
          is_faulty: true,
          current_value: true,
        },
      }),
    );
    expect(screen.getByRole("link", { name: "Ch. 201" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
    expect(screen.getByRole("link", { name: /fault/ })).toHaveAttribute(
      "href",
      "/devices/d1#active-faults",
    );
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
