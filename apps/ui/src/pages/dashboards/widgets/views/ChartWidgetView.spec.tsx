import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DataPoint, TimeSeries } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.chart.error": "Could not load history",
    "widgets.chart.noSeries": "No history recorded",
    "widgets.chart.noData": "No data over the period",
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

// The chart renders an SVG through visx; assert on the series label it emits
// rather than on chart internals.
vi.mock("@/components/charts/TimeSeriesChart", () => ({
  default: ({ lineSeries }: { lineSeries?: { label: string }[] }) => (
    <div data-testid="chart">{lineSeries?.map((s) => s.label).join(",")}</div>
  ),
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
    isLoading: false,
    error: null,
    ...over,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

  it("reports a fetch failure", () => {
    mockPeriod({ last: "3h" });
    mockSeries({ error: new Error("boom"), points: [] });

    render(<ChartWidgetView config={CONFIG} />);

    expect(screen.getByText("Could not load history")).toBeInTheDocument();
  });
});
