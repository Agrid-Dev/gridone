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
    "widgets.kpi.noMatch": "The target matches no device",
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

const useKpiLiveAggregate = vi.fn();
vi.mock("./useKpiLiveAggregate", () => ({
  useKpiLiveAggregate: (args: unknown) => useKpiLiveAggregate(args),
}));

const useSpaceAggregate = vi.fn();
vi.mock("./useSpaceAggregate", () => ({
  useSpaceAggregate: (args: unknown) => useSpaceAggregate(args),
}));

const useDashboardPeriod = vi.fn();
vi.mock("../../useDashboardPeriod", () => ({
  useDashboardPeriod: () => useDashboardPeriod(),
}));

// Imported after the mocks are registered.
import { KpiWidgetView } from "./KpiWidgetView";

const TEMPERATURE_ATTRIBUTE = {
  target: { devices: { ids: ["dev1"] }, attribute: "temperature" },
  space_agg: null,
  unit: "°C",
  precision: 1,
};

const LIVE_CONFIG = {
  type: "kpi",
  attributes: [TEMPERATURE_ATTRIBUTE],
  temporal: "live",
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
  // Period tests only care about useDevice when a case overrides this: the
  // period view probes it solely to disambiguate a 404 from useKpiAggregate.
  useDevice.mockReturnValue({ data: undefined, isLoading: false, error: null });
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
          attributes: [
            {
              ...TEMPERATURE_ATTRIBUTE,
              target: { devices: { ids: ["dev1"] }, attribute: "power" },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("explains a config with no target", () => {
    mockDevice();

    render(
      <KpiWidgetView
        config={{
          ...LIVE_CONFIG,
          attributes: [
            {
              ...TEMPERATURE_ATTRIBUTE,
              target: { devices: {}, attribute: "" },
            },
          ],
        }}
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

  it("renders one row per attribute, sharing the tile's temporal mode", () => {
    mockDevice({
      data: {
        id: "dev1",
        name: "Thermostat 1",
        type: "thermostat",
        attributes: {
          temperature: { current_value: 21.456, data_type: "float" },
          humidity: { current_value: 55, data_type: "float" },
        },
      },
    });

    render(
      <KpiWidgetView
        config={{
          type: "kpi",
          temporal: "live",
          attributes: [
            TEMPERATURE_ATTRIBUTE,
            {
              target: { devices: { ids: ["dev1"] }, attribute: "humidity" },
              space_agg: null,
              unit: "%",
              precision: 0,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("21.5")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
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

  // The aggregate endpoint 404s the same way for both cases; the view tells
  // them apart by also checking whether the device itself still exists.
  it("reads a 404 as no recorded history when the device still exists", () => {
    useKpiAggregate.mockReturnValue({
      isLoading: false,
      error: new GridoneError(404, "no series"),
    });
    useDevice.mockReturnValue({
      data: { id: "dev1" },
      isLoading: false,
      error: null,
    });

    render(<KpiWidgetView config={PERIOD_CONFIG} />);

    expect(
      screen.getByText("No history is recorded for this attribute"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This device no longer exists"),
    ).not.toBeInTheDocument();
  });

  it("reads a 404 as the device no longer existing when useDevice 404s too", () => {
    useKpiAggregate.mockReturnValue({
      isLoading: false,
      error: new GridoneError(404, "no series"),
    });
    useDevice.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new GridoneError(404, "gone"),
    });

    render(<KpiWidgetView config={PERIOD_CONFIG} />);

    expect(
      screen.getByText("This device no longer exists"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No history is recorded for this attribute"),
    ).not.toBeInTheDocument();
  });
});

const SPACE_ATTRIBUTE = {
  target: { devices: { types: ["meter"] }, attribute: "power" },
  space_agg: "sum",
  unit: "W",
  precision: 0,
};

const SPACE_LIVE_CONFIG = {
  type: "kpi",
  attributes: [SPACE_ATTRIBUTE],
  temporal: "live",
};

const SPACE_PERIOD_CONFIG = {
  ...SPACE_LIVE_CONFIG,
  temporal: { operator: "avg" },
};

describe("KpiWidgetView (live, space_agg)", () => {
  it("shows the folded value across the set", () => {
    useKpiLiveAggregate.mockReturnValue({
      data: { value: 4500, data_type: "int", device_count: 3 },
      isLoading: false,
      error: null,
    });

    render(<KpiWidgetView config={SPACE_LIVE_CONFIG} />);

    expect(useKpiLiveAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: SPACE_ATTRIBUTE.target,
        spaceAgg: "sum",
      }),
    );
    expect(screen.getByText("4500")).toBeInTheDocument();
    expect(screen.getByText("W")).toBeInTheDocument();
  });

  it("reads a 422 as the target matching no device", () => {
    useKpiLiveAggregate.mockReturnValue({
      isLoading: false,
      error: new GridoneError(422, "no match"),
    });

    render(<KpiWidgetView config={SPACE_LIVE_CONFIG} />);

    expect(
      screen.getByText("The target matches no device"),
    ).toBeInTheDocument();
  });
});

describe("KpiWidgetView (period, space_agg)", () => {
  it("computes via a single whole-period space request", () => {
    useSpaceAggregate.mockReturnValue({
      data: {
        aggregation_data_type: "float",
        points: [{ interval_start: "2026-07-28T10:00:00Z", value: 1200.4 }],
      },
      isLoading: false,
      error: null,
    });

    render(<KpiWidgetView config={SPACE_PERIOD_CONFIG} />);

    expect(useSpaceAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: SPACE_ATTRIBUTE.target,
        agg: "avg",
        spaceAgg: "sum",
        interval: "whole",
        last: "7d",
      }),
    );
    expect(screen.getByText("1200")).toBeInTheDocument();
  });

  it("reads a 404 as no history recorded across the set", () => {
    useSpaceAggregate.mockReturnValue({
      isLoading: false,
      error: new GridoneError(404, "no series"),
    });

    render(<KpiWidgetView config={SPACE_PERIOD_CONFIG} />);

    expect(
      screen.getByText("No history is recorded for this attribute"),
    ).toBeInTheDocument();
  });
});
