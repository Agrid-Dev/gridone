import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DataPoint, TimeSeries } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.chart.error": "Could not load history",
    "widgets.chart.noSeries": "No history recorded",
    "widgets.chart.noData": "No data over the period",
    "widgets.chart.unboundedPeriod": "Aggregation needs a bounded period",
  }),
);

const useTimeSeries = vi.fn();
vi.mock("@/hooks/useTimeSeries", () => ({
  useTimeSeries: (args: unknown) => useTimeSeries(args),
}));

const useDashboardPeriod = vi.fn();
vi.mock("../../useDashboardPeriod", () => ({
  useDashboardPeriod: () => useDashboardPeriod(),
}));

const useDeviceById = vi.fn();
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id: string) => useDeviceById(id),
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
    const panel = props.lineSeries
      ? "line"
      : props.intSeries
        ? "int"
        : props.stringSeries
          ? "string"
          : "boolean";
    return (
      <div
        data-testid="chart"
        data-panel={panel}
        data-points={props.timestamps?.length}
      >
        {series?.map((s) => s.label).join(",")}
      </div>
    );
  },
}));

// Imported after the mocks are registered.
import { ChartWidgetView } from "./ChartWidgetView";

const CONFIG = {
  type: "chart",
  device_id: "dev1",
  attribute: "temperature",
};

const SERIES = { id: "s1", data_type: "float" } as unknown as TimeSeries;
const POINTS: DataPoint[] = [
  { timestamp: "2026-07-28T10:00:00Z", value: 21.5 },
];

function mockPeriod(query: Record<string, string>, refetchInterval = 300_000) {
  useDashboardPeriod.mockReturnValue({ query, refetchInterval });
}

function mockSeries(over: Record<string, unknown> = {}) {
  useTimeSeries.mockReturnValue({
    series: SERIES,
    points: POINTS,
    dataType: "float",
    interval: null,
    isLoading: false,
    error: null,
    ...over,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useDeviceById.mockReturnValue({ data: { id: "dev1", name: "Thermostat 1" } });
});

describe("ChartWidgetView", () => {
  it("fetches the configured attribute over the dashboard period", () => {
    mockPeriod({ last: "7d" });
    mockSeries();

    render(<ChartWidgetView config={CONFIG} />);

    expect(useTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "dev1",
        attributeName: "temperature",
        last: "7d",
        refetchInterval: 300_000,
      }),
    );
    expect(screen.getByTestId("chart")).toHaveTextContent("Temperature");
  });

  // A dashboard chart is read outside any device's page, so the attribute name
  // alone doesn't say whose reading it is.
  it("names the device in the series label", () => {
    mockPeriod({ last: "3h" });
    mockSeries();

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByTestId("chart")).toHaveTextContent(
      "Thermostat 1 — Temperature",
    );
  });

  it("falls back to the attribute alone until the device arrives", () => {
    useDeviceById.mockReturnValue({ data: undefined });
    mockPeriod({ last: "3h" });
    mockSeries();

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByTestId("chart")).toHaveTextContent("Temperature");
  });

  it("passes a custom range through as start/end", () => {
    mockPeriod({ start: "2026-01-01T00:00", end: "2026-01-31T23:59" }, 0);
    mockSeries();

    render(<ChartWidgetView config={CONFIG} />);

    expect(useTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        start: "2026-01-01T00:00",
        end: "2026-01-31T23:59",
      }),
    );
  });

  // The chart draws an empty frame for an empty series, so the widget has to
  // say so itself.
  it("explains an empty period instead of drawing an empty chart", () => {
    mockPeriod({ last: "3h" });
    mockSeries({ points: [] });

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByText("No data over the period")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("distinguishes an attribute with no recorded history", () => {
    mockPeriod({ last: "3h" });
    mockSeries({ series: null, points: [] });

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByText("No history recorded")).toBeInTheDocument();
  });

  it("passes the configured operator down", () => {
    mockPeriod({ last: "1d" });
    mockSeries({ interval: "1h" });

    render(<ChartWidgetView config={{ ...CONFIG, agg: "avg" }} />);

    expect(useTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({ agg: "avg" }),
    );
  });

  // `count` yields ints whatever went in, and averaging a bool yields a float,
  // so the panel has to follow what came back rather than what was recorded.
  it("panels by the aggregated type, not the recorded one", () => {
    mockPeriod({ last: "1d" });
    mockSeries({ dataType: "int", interval: "1h" });

    render(<ChartWidgetView config={{ ...CONFIG, agg: "count" }} />);

    expect(screen.getByTestId("chart")).toHaveAttribute("data-panel", "int");
  });

  it("names the operator and resolved bucket in the label", () => {
    mockPeriod({ last: "1d" });
    mockSeries({ interval: "1h" });

    render(<ChartWidgetView config={{ ...CONFIG, agg: "avg" }} />);

    expect(screen.getByTestId("chart")).toHaveTextContent(
      "Thermostat 1 — Temperature · avg · 1h",
    );
  });

  // Raw points need the last value held to the window end to draw at all;
  // buckets already tile the window, so holding would invent one.
  it("holds a raw series to the window end but never a bucketed one", () => {
    mockPeriod({ last: "3h" });
    mockSeries();
    const { unmount } = render(<ChartWidgetView config={CONFIG} />);
    expect(screen.getByTestId("chart")).toHaveAttribute("data-points", "2");
    unmount();

    mockSeries({ interval: "1h" });
    render(<ChartWidgetView config={{ ...CONFIG, agg: "avg" }} />);
    expect(screen.getByTestId("chart")).toHaveAttribute("data-points", "1");
  });

  // "All time" resolves to no start, end or last. Raw reads accept that;
  // aggregation cannot, and used to fail as though the attribute were at fault
  // while raw charts beside it kept rendering.
  it("explains an unbounded period instead of a failed request", () => {
    mockPeriod({});
    mockSeries();

    render(<ChartWidgetView config={{ ...CONFIG, agg: "avg" }} />);

    expect(
      screen.getByText("Aggregation needs a bounded period"),
    ).toBeInTheDocument();
    expect(useTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("still plots raw over an unbounded period", () => {
    mockPeriod({});
    mockSeries();

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(useTimeSeries).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("reports a fetch failure", () => {
    mockPeriod({ last: "3h" });
    mockSeries({ error: new Error("boom"), points: [] });

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByText("Could not load history")).toBeInTheDocument();
  });
});
