import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { StandardControlProps } from "../../types";
import { WeatherSensorSupervision } from "../WeatherSensorSupervision";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.weatherSensor.conditions": "Conditions",
    "controls.weatherSensor.outdoor": "Extérieur",
    "controls.weatherSensor.humidity": "Humidité",
    "controls.weatherSensor.wind": "Vent",
    "controls.weatherSensor.direction": "Direction",
    "controls.weatherSensor.compass.SW": "SO",
  }),
);

vi.mock("../WeatherTemperatureHistory", () => ({
  WeatherTemperatureHistory: ({ deviceId }: { deviceId: string }) => (
    <div data-testid="temperature-history">{deviceId}</div>
  ),
}));

function attribute(name: string, currentValue: number) {
  return {
    name,
    kind: "standard" as const,
    data_type: "float" as const,
    read_write_modes: ["read"],
    current_value: currentValue,
  };
}

function weatherDevice(): Device {
  return {
    id: "weather-1",
    name: "Station toiture",
    type: "weather_sensor",
    tags: {},
    attributes: {
      temperature: attribute("temperature", 8.1),
      humidity: attribute("humidity", 72),
      wind_speed: attribute("wind_speed", 21),
      wind_direction: attribute("wind_direction", 245),
    },
    is_faulty: false,
    driver_id: "driver-1",
    transport_id: "transport-1",
    config: {},
  };
}

function renderSupervision(device = weatherDevice()) {
  return render(
    <WeatherSensorSupervision
      {...({ device } as unknown as StandardControlProps)}
    />,
  );
}

afterEach(cleanup);

describe("WeatherSensorSupervision", () => {
  it("presents the current conditions in the screenshot layout", () => {
    renderSupervision();

    expect(screen.getByText("Conditions")).toBeInTheDocument();
    expect(screen.getByText("Extérieur")).toBeInTheDocument();
    expect(screen.getByText("8,1")).toBeInTheDocument();
    expect(screen.getAllByText("21")).toHaveLength(2);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("245")).toBeInTheDocument();
    expect(screen.getByText("° · SO")).toBeInTheDocument();
    expect(screen.getByTestId("temperature-history")).toHaveTextContent(
      "weather-1",
    );
  });

  it("exposes accessible meters with their current readings", () => {
    renderSupervision();

    expect(screen.getByRole("meter", { name: "Humidité" })).toHaveAttribute(
      "aria-valuenow",
      "72",
    );
    expect(screen.getByRole("meter", { name: "Vent" })).toHaveAttribute(
      "aria-valuenow",
      "21",
    );
    expect(screen.getByRole("meter", { name: "Direction" })).toHaveAttribute(
      "aria-valuenow",
      "245",
    );
  });

  it("does not render for another device type", () => {
    const device = weatherDevice();
    device.type = "thermostat";
    const { container } = renderSupervision(device);

    expect(container).toBeEmptyDOMElement();
  });
});
