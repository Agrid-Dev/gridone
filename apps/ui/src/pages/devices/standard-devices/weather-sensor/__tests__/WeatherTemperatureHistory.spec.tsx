import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import {
  temperaturePath,
  WeatherTemperatureHistory,
} from "../WeatherTemperatureHistory";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.weatherSensor.temperatureLast24h":
      "Température extérieure · 24 h",
    "controls.weatherSensor.noTemperatureHistory":
      "Aucun historique de température",
    "controls.weatherSensor.temperatureChartLabel":
      "Température extérieure sur les dernières 24 heures",
    "controls.weatherSensor.min": "min {{value}}",
    "controls.weatherSensor.max": "max {{value}}",
  }),
);

const historyState = {
  timestamps: [] as Date[],
  temperatures: [] as (number | null)[],
  min: null as number | null,
  max: null as number | null,
  isLoading: false,
  hasData: false,
};

vi.mock("../useWeatherTemperatureHistory", () => ({
  useWeatherTemperatureHistory: () => historyState,
}));

afterEach(() => {
  cleanup();
  historyState.timestamps = [];
  historyState.temperatures = [];
  historyState.min = null;
  historyState.max = null;
  historyState.isLoading = false;
  historyState.hasData = false;
});

describe("WeatherTemperatureHistory", () => {
  it("shows a skeleton while loading", () => {
    historyState.isLoading = true;
    const { container } = render(
      <WeatherTemperatureHistory deviceId="weather-1" />,
    );

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows an empty state without recorded temperature", () => {
    render(<WeatherTemperatureHistory deviceId="weather-1" />);

    expect(
      screen.getByText("Aucun historique de température"),
    ).toBeInTheDocument();
  });

  it("renders the trend and locale-aware minimum and maximum", () => {
    historyState.timestamps = [
      new Date("2026-08-09T12:00:00Z"),
      new Date("2026-08-10T00:00:00Z"),
      new Date("2026-08-10T12:00:00Z"),
    ];
    historyState.temperatures = [4.2, 11.8, 8.1];
    historyState.min = 4.2;
    historyState.max = 11.8;
    historyState.hasData = true;

    render(<WeatherTemperatureHistory deviceId="weather-1" />);

    expect(screen.getByText(/min 4,2 °C/)).toBeInTheDocument();
    expect(screen.getByText(/max 11,8 °C/)).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Température extérieure sur les dernières 24 heures",
      }),
    ).toBeInTheDocument();
  });
});

describe("temperaturePath", () => {
  it("uses real timestamp spacing and omits null readings", () => {
    const path = temperaturePath(
      [
        new Date("2026-08-10T00:00:00Z"),
        new Date("2026-08-10T06:00:00Z"),
        new Date("2026-08-10T18:00:00Z"),
      ],
      [4, null, 10],
    );

    expect(path).toMatch(/^M 2 /);
    expect(path.match(/[ML]/g)).toHaveLength(2);
    expect(path).toContain("L 718");
  });

  it("returns no path without readings", () => {
    expect(temperaturePath([], [])).toBe("");
  });
});
