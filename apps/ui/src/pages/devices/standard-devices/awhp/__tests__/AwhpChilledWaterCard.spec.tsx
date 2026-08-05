import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Device } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";
import type { Series } from "@/components/charts/TimeSeriesChart";
import { DeviceType, type AwhpDevice } from "@/lib/devices";
import type { ChilledWaterKpis } from "../chilledWaterKpis";
import { AwhpChilledWaterCard } from "../AwhpChilledWaterCard";

vi.mock("react-i18next", () =>
  createI18nMock({
    "controls.awhp.chilledWaterLast24h": "Chilled water — last 24 h",
    "controls.awhp.waterLast24h": "Water — last 24 h",
    "controls.awhp.noWaterHistory": "No water temperature history",
    "controls.awhp.outlet": "Outlet",
    "controls.awhp.setpoint": "Setpoint",
    "controls.awhp.avgDeviation": "Avg. deviation",
    "controls.awhp.runHours": "Run hours",
    "controls.awhp.energy24h": "Energy 24 h",
  }),
);

const historyState = {
  timestamps: [] as Date[],
  values: {
    outlet_temperature: [] as (number | null)[],
    setpoint_temperature: [] as (number | null)[],
  },
  kpis: {
    meanDeviation: null,
    runSeconds: null,
    energyKwh: null,
  } as ChilledWaterKpis,
  isLoading: false,
  hasData: false,
};

vi.mock("../useAwhpChilledWaterHistory", () => ({
  useAwhpChilledWaterHistory: () => historyState,
}));

const chartProps = vi.fn();

vi.mock("@/components/charts/TimeSeriesChart", () => ({
  default: (props: unknown) => {
    chartProps(props);
    return <div data-testid="chart" />;
  },
}));

function makeAwhp(mode: string | null = "cool"): AwhpDevice {
  return {
    id: "dev-1",
    name: "GF-01",
    type: DeviceType.Awhp,
    tags: {},
    driver_id: "drv-1",
    transport_id: "tr-1",
    config: {},
    attributes: {
      mode: {
        name: "mode",
        data_type: "string",
        read_write_modes: ["read"],
        current_value: mode,
        last_updated: null,
      },
    } as Device["attributes"],
    is_faulty: false,
  } as AwhpDevice;
}

afterEach(() => {
  cleanup();
  chartProps.mockReset();
  historyState.isLoading = false;
  historyState.hasData = false;
  historyState.kpis = {
    meanDeviation: null,
    runSeconds: null,
    energyKwh: null,
  };
});

describe("AwhpChilledWaterCard", () => {
  it("shows a skeleton while loading", () => {
    historyState.isLoading = true;
    const { container } = render(<AwhpChilledWaterCard device={makeAwhp()} />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("shows the empty message when the device records no outlet temperature", () => {
    render(<AwhpChilledWaterCard device={makeAwhp()} />);

    expect(
      screen.getByText("No water temperature history"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("charts the outlet line and the setpoint as a dashed step series", () => {
    historyState.hasData = true;
    render(<AwhpChilledWaterCard device={makeAwhp()} />);

    expect(screen.getByText("Chilled water — last 24 h")).toBeInTheDocument();
    const props = chartProps.mock.calls[0][0] as {
      lineSeries: Series[];
      intSeries: Series[];
    };
    expect(props.lineSeries).toEqual([
      { key: "outlet_temperature", label: "Outlet" },
    ]);
    expect(props.intSeries).toEqual([
      { key: "setpoint_temperature", label: "Setpoint", dash: true },
    ]);
  });

  it("titles the card mode-neutrally when the unit heats its water", () => {
    historyState.hasData = true;
    render(<AwhpChilledWaterCard device={makeAwhp("heat")} />);

    expect(screen.getByText("Water — last 24 h")).toBeInTheDocument();
  });

  it("renders only the computable KPIs", () => {
    historyState.hasData = true;
    historyState.kpis = {
      meanDeviation: 0.32,
      runSeconds: 34200,
      energyKwh: null,
    };
    render(<AwhpChilledWaterCard device={makeAwhp()} />);

    expect(screen.getByText("Avg. deviation")).toBeInTheDocument();
    expect(screen.getByText("0.3 °C")).toBeInTheDocument();
    expect(screen.getByText("Run hours")).toBeInTheDocument();
    expect(screen.getByText("9 h 30")).toBeInTheDocument();
    expect(screen.queryByText("Energy 24 h")).not.toBeInTheDocument();
  });

  it("omits the KPI strip entirely when nothing is computable", () => {
    historyState.hasData = true;
    render(<AwhpChilledWaterCard device={makeAwhp()} />);

    expect(screen.queryByText("Avg. deviation")).not.toBeInTheDocument();
    expect(screen.queryByText("Run hours")).not.toBeInTheDocument();
    expect(screen.queryByText("Energy 24 h")).not.toBeInTheDocument();
  });
});
