import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DataPoint } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.chart.error": "Could not load history",
    "widgets.chart.targetEmpty": "The target matches no device",
    "widgets.chart.mixedTypes": "Mixed data types",
    "widgets.chart.noSeries": "No history recorded",
    "widgets.chart.noData": "No data over the period",
    "widgets.chart.unboundedPeriod": "Aggregation needs a bounded period",
  }),
);

const useTargetDevices = vi.fn();
vi.mock("./useTargetDevices", () => ({
  useTargetDevices: (...args: unknown[]) => useTargetDevices(...args),
}));

const useMultiTimeSeries = vi.fn();
vi.mock("@/hooks/useMultiTimeSeries", () => ({
  useMultiTimeSeries: (args: unknown) => useMultiTimeSeries(args),
}));

const useDashboardPeriod = vi.fn();
vi.mock("../../useDashboardPeriod", () => ({
  useDashboardPeriod: () => useDashboardPeriod(),
}));

// The chart renders an SVG through visx; assert on the props it is handed
// rather than on chart internals. `panel` names which of the four prop pairs
// was filled, which is how the data type reaches the display.
vi.mock("@/components/charts/TimeSeriesChart", () => ({
  default: (props: {
    timestamps?: Date[];
    lineSeries?: { label: string }[];
    intSeries?: { label: string }[];
    stringSeries?: { label: string }[];
    booleanSeries?: { label: string }[];
  }) => {
    const series =
      props.lineSeries ??
      props.intSeries ??
      props.stringSeries ??
      props.booleanSeries;
    return (
      <div data-testid="chart" data-points={props.timestamps?.length}>
        {series?.map((s) => s.label).join(",")}
      </div>
    );
  },
}));

// Imported after the mocks are registered.
import { ChartWidgetView } from "./ChartWidgetView";

const CONFIG = {
  type: "chart",
  target: { devices: { types: ["thermostat"] }, attribute: "temperature" },
};

const POINTS: DataPoint[] = [
  { timestamp: "2026-07-28T10:00:00Z", value: 21.5 },
];

/** One resolved device's fetch result, healthy by default. */
function seriesResult(deviceId: string, over: Record<string, unknown> = {}) {
  return {
    deviceId,
    series: { id: `s-${deviceId}`, data_type: "float" },
    points: POINTS,
    dataType: "float",
    interval: null,
    isLoading: false,
    error: null,
    ...over,
  };
}

function mockResolved(names: string[]) {
  useTargetDevices.mockReturnValue({
    devices: names.map((name, i) => ({ id: `dev${i + 1}`, name })),
    isLoading: false,
    error: null,
  });
}

function mockSeries(results: Record<string, unknown>[]) {
  useMultiTimeSeries.mockReturnValue({
    results,
    isLoading: results.some((r) => r.isLoading),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useDashboardPeriod.mockReturnValue({
    query: { last: "7d" },
    refetchInterval: 300_000,
  });
});

describe("ChartWidgetView", () => {
  it("plots one series per resolved device, labelled by its name", () => {
    mockResolved(["Thermostat 1", "Thermostat 2"]);
    mockSeries([seriesResult("dev1"), seriesResult("dev2")]);

    render(<ChartWidgetView config={CONFIG} />);

    expect(useMultiTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceIds: ["dev1", "dev2"],
        attributeName: "temperature",
        last: "7d",
        refetchInterval: 300_000,
      }),
    );
    expect(screen.getByTestId("chart")).toHaveTextContent(
      "Thermostat 1,Thermostat 2",
    );
  });

  // A lone series has to say more than the device: outside any device's page,
  // the attribute alone doesn't say whose reading it is — the label a
  // single-device chart has always carried.
  it("keeps the descriptive single-series label for a one-device target", () => {
    mockResolved(["Thermostat 1"]);
    mockSeries([seriesResult("dev1")]);

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByTestId("chart")).toHaveTextContent(
      "Thermostat 1 — Temperature",
    );
  });

  it("explains a target that resolves to no device", () => {
    mockResolved([]);
    mockSeries([]);

    render(<ChartWidgetView config={CONFIG} />);

    expect(
      screen.getByText("The target matches no device"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  // Saving enforces one data type across the set, but a criteria target is
  // dynamic — the set can drift apart afterwards. That must read as a state,
  // not crash the widget.
  it("names a data-type drift instead of charting it", () => {
    mockResolved(["Thermostat 1", "Relay"]);
    mockSeries([
      seriesResult("dev1"),
      seriesResult("dev2", {
        series: { id: "s-dev2", data_type: "bool" },
        dataType: "bool",
        points: [{ timestamp: "2026-07-28T10:00:00Z", value: true }],
      }),
    ]);

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByText("Mixed data types")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("still plots the series that loaded when one device fails", () => {
    mockResolved(["Thermostat 1", "Thermostat 2"]);
    mockSeries([
      seriesResult("dev1"),
      seriesResult("dev2", {
        series: null,
        points: [],
        dataType: null,
        error: new Error("boom"),
      }),
    ]);

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(
      screen.queryByText("Could not load history"),
    ).not.toBeInTheDocument();
  });
});
