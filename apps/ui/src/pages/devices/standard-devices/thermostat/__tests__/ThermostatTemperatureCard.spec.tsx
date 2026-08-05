import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import type { Series } from "@/components/charts/TimeSeriesChart";
import { ThermostatTemperatureCard } from "../ThermostatTemperatureCard";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.thermostat.temperatureLast24h": "Temperature — last 24 h",
    "controls.thermostat.noTemperatureHistory": "No temperature history",
    "controls.thermostat.measured": "Measured",
    "controls.thermostat.setpoint": "Setpoint",
  }),
);

const historyState = {
  timestamps: [] as Date[],
  values: {
    temperature: [] as (number | null)[],
    temperature_setpoint: [] as (number | null)[],
  },
  isLoading: false,
  hasData: false,
};

vi.mock("../useThermostatTemperatureHistory", () => ({
  useThermostatTemperatureHistory: () => historyState,
}));

const chartProps = vi.fn();

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  default: (props: unknown) => {
    chartProps(props);
    return <div data-testid="chart" />;
  },
}));

afterEach(() => {
  cleanup();
  chartProps.mockReset();
  historyState.isLoading = false;
  historyState.hasData = false;
});

describe("ThermostatTemperatureCard", () => {
  it("shows a skeleton while loading", () => {
    historyState.isLoading = true;
    const { container } = render(<ThermostatTemperatureCard deviceId="d1" />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("shows the empty message when the device records no temperature", () => {
    render(<ThermostatTemperatureCard deviceId="d1" />);

    expect(screen.getByText("No temperature history")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("charts the measured line and the setpoint as a dashed step series", () => {
    historyState.hasData = true;
    render(<ThermostatTemperatureCard deviceId="d1" />);

    expect(screen.getByTestId("chart")).toBeInTheDocument();
    const props = chartProps.mock.calls[0][0] as {
      lineSeries: Series[];
      intSeries: Series[];
    };
    expect(props.lineSeries).toEqual([
      { key: "temperature", label: "Measured" },
    ]);
    expect(props.intSeries).toEqual([
      { key: "temperature_setpoint", label: "Setpoint", dash: true },
    ]);
  });
});
