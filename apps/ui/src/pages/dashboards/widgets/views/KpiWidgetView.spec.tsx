import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GridoneError } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "widgets.kpi.targetEmpty": "Pick a device and an attribute",
    "widgets.kpi.notFound": "This device no longer exists",
    "widgets.kpi.attributeMissing":
      "This device no longer exposes this attribute",
    "widgets.kpi.noHistory": "No history is recorded for this attribute",
    "widgets.kpi.error": "Could not load this value",
    "widgets.kpi.noOperator": "Pick an aggregation operator",
    "widgets.kpi.unboundedPeriod": "Aggregation needs a bounded period",
  }),
);

const useDevice = vi.fn();
vi.mock("@/hooks/useDevice", () => ({
  useDevice: (...args: unknown[]) => useDevice(...args),
}));

const useKpiAggregate = vi.fn();
vi.mock("./useKpiAggregate", () => ({
  useKpiAggregate: (args: unknown) => useKpiAggregate(args),
}));

const useDashboardPeriod = vi.fn();
vi.mock("../../useDashboardPeriod", () => ({
  useDashboardPeriod: () => useDashboardPeriod(),
}));

// Imported after the mocks are registered.
import { KpiWidgetView } from "./KpiWidgetView";

const LIVE_CONFIG = {
  type: "kpi",
  target: { devices: { ids: ["dev1"] }, attribute: "temperature" },
  temporal: "live",
  unit: "°C",
  precision: 1,
};

const PERIOD_CONFIG = {
  ...LIVE_CONFIG,
  temporal: { operator: "sum" },
};

function mockDevice(over: Record<string, unknown> = {}) {
  useDevice.mockReturnValue({
    data: {
      id: "dev1",
      name: "Thermostat 1",
      type: "thermostat",
      attributes: {
        temperature: { current_value: 21.456, data_type: "float" },
      },
    },
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
  useDashboardPeriod.mockReturnValue({
    query: { last: "7d" },
    refetchInterval: 300_000,
  });
});

describe("KpiWidgetView (live)", () => {
  it("shows the current value with unit and precision", () => {
    mockDevice();

    render(<KpiWidgetView config={LIVE_CONFIG} />);

    expect(screen.getByText("21.5")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
  });

  it("renders a bool attribute's label instead of a number", () => {
    mockDevice({
      data: {
        id: "dev1",
        name: "Relay",
        type: "thermostat",
        attributes: { power: { current_value: true, data_type: "bool" } },
      },
    });

    render(
      <KpiWidgetView
        config={{
          ...LIVE_CONFIG,
          target: { devices: { ids: ["dev1"] }, attribute: "power" },
        }}
      />,
    );

    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("explains a config with no target", () => {
    mockDevice();

    render(
      <KpiWidgetView
        config={{ ...LIVE_CONFIG, target: { devices: {}, attribute: "" } }}
      />,
    );

    expect(
      screen.getByText("Pick a device and an attribute"),
    ).toBeInTheDocument();
  });

  it("reads a 404 as the device no longer existing", () => {
    mockDevice({ data: undefined, error: new GridoneError(404, "gone") });

    render(<KpiWidgetView config={LIVE_CONFIG} />);

    expect(
      screen.getByText("This device no longer exists"),
    ).toBeInTheDocument();
  });

  it("names a device that no longer exposes the attribute", () => {
    mockDevice({
      data: {
        id: "dev1",
        name: "Thermostat 1",
        type: "thermostat",
        attributes: {},
      },
    });

    render(<KpiWidgetView config={LIVE_CONFIG} />);

    expect(
      screen.getByText("This device no longer exposes this attribute"),
    ).toBeInTheDocument();
  });
});

describe("KpiWidgetView (period)", () => {
  it("computes via a single whole-period request", () => {
    useKpiAggregate.mockReturnValue({
      data: {
        interval: "whole",
        aggregation_data_type: "float",
        points: [{ interval_start: "2026-07-28T10:00:00Z", value: 145.2 }],
      },
      isLoading: false,
      error: null,
    });

    render(<KpiWidgetView config={PERIOD_CONFIG} />);

    expect(useKpiAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: "dev1",
        attribute: "temperature",
        agg: "sum",
        last: "7d",
        refetchInterval: 300_000,
      }),
    );
    expect(screen.getByText("145.2")).toBeInTheDocument();
  });

  it("asks for a bounded period before aggregating", () => {
    useDashboardPeriod.mockReturnValue({ query: {}, refetchInterval: false });
    useKpiAggregate.mockReturnValue({ isLoading: false, error: null });

    render(<KpiWidgetView config={PERIOD_CONFIG} />);

    expect(
      screen.getByText("Aggregation needs a bounded period"),
    ).toBeInTheDocument();
  });

  it("asks for an operator when none is picked yet", () => {
    useKpiAggregate.mockReturnValue({ isLoading: false, error: null });

    render(
      <KpiWidgetView
        config={{ ...PERIOD_CONFIG, temporal: { operator: undefined } }}
      />,
    );

    expect(
      screen.getByText("Pick an aggregation operator"),
    ).toBeInTheDocument();
  });

  // A 404 here means no history is recorded for the attribute — the device
  // itself is not in question, unlike the live view's 404.
  it("reads a 404 as no recorded history, not a missing device", () => {
    useKpiAggregate.mockReturnValue({
      isLoading: false,
      error: new GridoneError(404, "no series"),
    });

    render(<KpiWidgetView config={PERIOD_CONFIG} />);

    expect(
      screen.getByText("No history is recorded for this attribute"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This device no longer exists"),
    ).not.toBeInTheDocument();
  });
});
