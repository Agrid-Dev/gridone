import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Device } from "@gridone/sdk";
import { TooltipProvider } from "@/components/ui";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceAttributePanes } from "../DeviceAttributePanes";

vi.mock("react-i18next", () =>
  createI18nMock(
    {
      "deviceDetails.panes.standard": "Standard",
      "deviceDetails.panes.faults": "Faults",
      "deviceDetails.panes.internal": "Internal",
      "attributes.temperature": "Température",
    },
    { language: "fr" },
  ),
);

afterEach(cleanup);

const device = {
  id: "dev-1",
  name: "Thermostat",
  type: "thermostat",
  attributes: {
    temperature: {
      kind: "standard",
      name: "temperature",
      data_type: "float",
      read_write_modes: ["read"],
      current_value: 21.4,
      last_updated: null,
      last_changed: null,
      unit: "°C",
      group: "sensors",
    },
    humidity: {
      kind: "standard",
      name: "humidity",
      data_type: "float",
      read_write_modes: ["read"],
      current_value: 44,
      last_updated: null,
      last_changed: null,
      group: "sensors",
    },
    temperature_setpoint: {
      kind: "standard",
      name: "temperature_setpoint",
      data_type: "float",
      read_write_modes: ["read", "write"],
      current_value: 21,
      last_updated: null,
      last_changed: null,
      label: { default: "Setpoint", translations: { fr: "Consigne" } },
      description: { default: "Requested room temperature" },
      unit: "°C",
    },
    fan_speed: {
      kind: "standard",
      name: "fan_speed",
      data_type: "string",
      read_write_modes: ["read"],
      current_value: "low",
      last_updated: null,
      last_changed: null,
    },
  },
} as unknown as Device;

function renderPanes() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <DeviceAttributePanes device={device} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("DeviceAttributePanes with driver metadata", () => {
  it("labels attributes from their declared label, the catalog, or the name", () => {
    renderPanes();
    expect(screen.getByText("Consigne")).toBeInTheDocument();
    expect(screen.getByText("Température")).toBeInTheDocument();
    expect(screen.getByText("Fan Speed")).toBeInTheDocument();
  });

  it("appends the declared unit to numeric values", () => {
    renderPanes();
    expect(screen.getByText("21.40 °C")).toBeInTheDocument();
    expect(screen.getByText("21.00 °C")).toBeInTheDocument();
    expect(screen.getByText("44.00")).toBeInTheDocument();
  });

  it("splits a pane into the groups the driver declares, ungrouped rows first", () => {
    renderPanes();
    const sensors = document.querySelector('[data-attribute-group="sensors"]');
    expect(sensors).not.toBeNull();
    expect(
      within(sensors as HTMLElement).getByText("Sensors"),
    ).toBeInTheDocument();
    expect(
      within(sensors as HTMLElement).getByText("Température"),
    ).toBeInTheDocument();
    expect(within(sensors as HTMLElement).queryByText("Consigne")).toBeNull();
    const sections = Array.from(document.querySelectorAll("section"));
    expect(sections[0].getAttribute("data-attribute-group")).toBeNull();
    expect(sections[1].getAttribute("data-attribute-group")).toBe("sensors");
  });
});
