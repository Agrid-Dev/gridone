import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "devices.card.measured": "{{value}} measured",
    "devices.card.noFault": "No fault",
    "devices.card.trendLabel": "24 h trend",
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

/** The history fetch is the thing being gated; a marker keeps this spec off
 *  the time-series stack while still proving whether it mounted. */
vi.mock("./DeviceSparkline", () => ({
  DeviceSparkline: ({ metric }: { metric: string }) => (
    <div data-testid="sparkline">{metric}</div>
  ),
}));

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

/** Replaces the inert global stub with one that reports the observed element
 *  as visible on the next tick, the way a real scroll into view would. */
function observeAsVisible() {
  type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0];
  class FiringObserver {
    constructor(private callback: ObserverCallback) {}
    observe(element: Element) {
      this.callback(
        [
          {
            isIntersecting: true,
            target: element,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", FiringObserver);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeviceFleetCard", () => {
  it("leads with the setpoint and shows the measured reading beside it", () => {
    renderCard(
      thermostat({
        temperature: attr(21.4),
        temperature_setpoint: attr(21),
        mode: attr("heat"),
        onoff_state: attr(true),
      }),
    );
    expect(screen.getByText("21,0°")).toBeInTheDocument();
    expect(screen.getByText("21,4° measured")).toBeInTheDocument();
    expect(screen.getByText("Heating")).toBeInTheDocument();
    expect(screen.getByText("Floor 2")).toBeInTheDocument();
  });

  it("falls back to the measure when the device has no setpoint", () => {
    renderCard(thermostat({ temperature: attr(21.4) }));
    expect(screen.getByText("21,4°")).toBeInTheDocument();
    expect(screen.queryByText(/measured/)).not.toBeInTheDocument();
  });

  it("reports the device as healthy when no fault is active", () => {
    renderCard(thermostat({ temperature: attr(21.4) }));
    expect(screen.getByText("No fault")).toBeInTheDocument();
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
    expect(screen.getByText("1 alert(s)")).toBeInTheDocument();
  });

  it("links the whole card to the device detail", () => {
    renderCard(thermostat());
    expect(screen.getByRole("link")).toHaveAttribute("href", "/devices/d1");
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

  describe("history gate", () => {
    beforeEach(() => {
      vi.unstubAllGlobals();
    });

    it("does not read history while the card is off-screen", () => {
      renderCard(thermostat({ temperature: attr(21.4) }));
      expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    });

    it("reads the primary metric once the card becomes visible", () => {
      observeAsVisible();
      renderCard(thermostat({ temperature: attr(21.4) }));
      expect(screen.getByTestId("sparkline")).toHaveTextContent("temperature");
    });

    it("stays quiet for a type with no primary measure", () => {
      observeAsVisible();
      renderCard({ ...thermostat(), type: "custom_vendor" } as Device);
      expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
    });
  });
});
