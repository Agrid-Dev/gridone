import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GridoneError, type DataPoint } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.chart.error": "Could not load history",
    "widgets.chart.targetEmpty": "The target matches no device",
    "widgets.chart.mixedTypes": "Mixed data types",
    "widgets.chart.noSeries": "No history recorded",
    "widgets.chart.noData": "No data over the period",
    "widgets.chart.unboundedPeriod": "Aggregation needs a bounded period",
    "widgets.chart.space.seriesLabel":
      "{{attribute}} · {{spaceAgg}} · {{interval}}",
    "widgets.chart.space.seriesLabelMixed":
      "{{attribute}} · {{agg}}, {{spaceAgg}} · {{interval}}",
    "widgets.chart.agg.captions.avg": "mean of the bucket",
    "widgets.chart.agg.captions.max": "highest value",
    "widgets.chart.space.captions.avg": "mean across devices",
    "attributes.temperature": "Temperature",
    // Deliberately unlike toLabel("onoff_state") ("Onoff State"), so a test
    // reading this proves the catalog was consulted, not the humanizer.
    "attributes.onoff_state": "On/off",
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

const useSpaceAggregate = vi.fn();
vi.mock("./useSpaceAggregate", () => ({
  useSpaceAggregate: (args: unknown) => useSpaceAggregate(args),
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

const SPACE_CONFIG = { ...CONFIG, agg: "avg", space_agg: "avg" };

function mockSpaceResult(over: Record<string, unknown> = {}) {
  useSpaceAggregate.mockReturnValue({
    data: {
      interval: "1h",
      agg: "avg",
      space_agg: "avg",
      data_type: "float",
      aggregation_data_type: "float",
      timezone: "UTC",
      series_count: 3,
      points: [
        { interval_start: "2026-07-28T10:00:00Z", value: 21.5, count: 3 },
        { interval_start: "2026-07-28T11:00:00Z", value: 22.0, count: 2 },
      ],
    },
    isLoading: false,
    error: null,
    ...over,
  });
}

describe("ChartWidgetView with a space aggregation", () => {
  it("folds the set into one labelled series with a single request", () => {
    mockSpaceResult();

    render(<ChartWidgetView config={SPACE_CONFIG} />);

    // One request for the folded series; no per-device fan-out at all.
    expect(useSpaceAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: SPACE_CONFIG.target,
        agg: "avg",
        spaceAgg: "avg",
        last: "7d",
        refetchInterval: 300_000,
      }),
    );
    expect(useMultiTimeSeries).not.toHaveBeenCalled();
    expect(useTargetDevices).not.toHaveBeenCalled();
    // Both operators are avg: saying "avg · avg" named neither role, and a
    // mean of means is still a mean — the across-devices wording stands alone.
    expect(screen.getByTestId("chart")).toHaveTextContent(
      "Temperature · mean across devices · 1h",
    );
  });

  it("labels the attribute from the catalog, not the snake_case humanizer", () => {
    mockSpaceResult({
      data: {
        interval: "1h",
        aggregation_data_type: "float",
        points: [{ interval_start: "2026-01-01T00:00:00Z", value: 1 }],
      },
    });

    render(
      <ChartWidgetView
        config={{
          ...SPACE_CONFIG,
          target: { ...SPACE_CONFIG.target, attribute: "onoff_state" },
        }}
      />,
    );

    const chart = screen.getByTestId("chart");
    expect(chart).toHaveTextContent("On/off · mean across devices · 1h");
    expect(chart).not.toHaveTextContent("Onoff State");
  });

  it("names both operators when they differ", () => {
    mockSpaceResult({
      data: {
        interval: "1h",
        aggregation_data_type: "float",
        points: [{ interval_start: "2026-01-01T00:00:00Z", value: 21 }],
      },
    });

    render(<ChartWidgetView config={{ ...SPACE_CONFIG, agg: "max" }} />);

    expect(screen.getByTestId("chart")).toHaveTextContent(
      "Temperature · highest value, mean across devices · 1h",
    );
  });

  it("reads a 404 as no recorded history for the set", () => {
    mockSpaceResult({
      data: undefined,
      error: new GridoneError(404, "no series"),
    });

    render(<ChartWidgetView config={SPACE_CONFIG} />);

    expect(screen.getByText("No history recorded")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("shows the empty-period state when no bucket holds a value", () => {
    mockSpaceResult({
      data: {
        interval: "1h",
        aggregation_data_type: "float",
        series_count: 2,
        points: [
          { interval_start: "2026-07-28T10:00:00Z", value: null, count: 0 },
        ],
      },
    });

    render(<ChartWidgetView config={SPACE_CONFIG} />);

    expect(screen.getByText("No data over the period")).toBeInTheDocument();
  });
});
