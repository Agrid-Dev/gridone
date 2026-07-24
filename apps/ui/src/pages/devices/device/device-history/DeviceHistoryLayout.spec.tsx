import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { Device, TimeSeries } from "@gridone/sdk";
import { TooltipProvider } from "@/components/ui/tooltip";

const { mockListSeries, mockGetSeriesPoints, mockGetStandardTypes } =
  vi.hoisted(() => ({
    mockListSeries: vi.fn(),
    mockGetSeriesPoints: vi.fn(),
    mockGetStandardTypes: vi.fn(),
  }));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    timeseries: {
      list: (...args: unknown[]) => mockListSeries(...args),
      getPoints: (...args: unknown[]) => mockGetSeriesPoints(...args),
      exportCsv: vi.fn(),
      exportPng: vi.fn(),
    },
    devices: {
      getStandardTypes: (...args: unknown[]) => mockGetStandardTypes(...args),
    },
  }),
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "common:common.columns": "Attributes",
    "common:common.searchAttributes": "Search attributes…",
    "common:common.selectAll": "Select all",
    "common:common.unselectAll": "Unselect all",
    "common:common.selectAllDisabledHint": "Too many attributes",
    "common:common.noResults": "No results",
    "deviceDetails.chart": "Chart",
    "deviceDetails.table": "Table",
  }),
);

// Radix Popover doesn't open reliably under jsdom pointer events; the popover
// interaction isn't what we verify here, so render it always-open.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockDevice = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/hooks/useDevice", () => ({
  useDeviceFromRoute: () => mockDevice.current,
}));

vi.mock("@/components/BreadcrumbProvider", () => ({
  useBreadcrumb: () => {},
}));

vi.mock("@/hooks/useCommandsByIds", () => ({
  useCommandsByIds: () => ({ commandsMap: new Map() }),
}));

vi.mock("@/hooks/useUsers", () => ({
  useUsers: () => ({ usersMap: new Map() }),
}));

import DeviceHistoryLayout from "./DeviceHistoryLayout";

function attrName(i: number) {
  return `attr_${String(i + 1).padStart(2, "0")}`;
}

/** Configure a device exposing `count` attributes, each with a time series. */
function setupDevice(count: number) {
  const names = Array.from({ length: count }, (_, i) => attrName(i));
  mockDevice.current = {
    id: "d1",
    name: "AHU-1",
    type: null,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes: Object.fromEntries(
      names.map((name) => [
        name,
        {
          kind: "standard",
          name,
          data_type: "float",
          read_write_modes: ["read"],
          current_value: null,
          last_updated: null,
          last_changed: null,
        },
      ]),
    ),
    is_faulty: false,
  } satisfies Device;

  const series: TimeSeries[] = names.map((metric) => ({
    id: `s-${metric}`,
    data_type: "float",
    owner_id: "d1",
    metric,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
  mockListSeries.mockResolvedValue(series);
}

/** Configure a thermostat whose standard-schema attributes are declared
 *  *after* a block of non-standard filler attributes, each with a time series.
 *  Returns the standard attribute names, in schema order. */
function setupThermostat() {
  const fillers = Array.from({ length: 10 }, (_, i) => `filler_${i + 1}`);
  const standard = [
    "temperature",
    "temperature_setpoint",
    "onoff_state",
    "mode",
    "fan_speed",
  ];
  const names = [...fillers, ...standard];
  mockDevice.current = {
    id: "d1",
    name: "Thermostat",
    type: "thermostat",
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes: Object.fromEntries(
      names.map((name) => [
        name,
        {
          kind: "standard",
          name,
          data_type: "float",
          read_write_modes: ["read"],
          current_value: null,
          last_updated: null,
          last_changed: null,
        },
      ]),
    ),
    is_faulty: false,
  } satisfies Device;

  const series: TimeSeries[] = names.map((metric) => ({
    id: `s-${metric}`,
    data_type: "float",
    owner_id: "d1",
    metric,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
  mockListSeries.mockResolvedValue(series);
  return standard;
}

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/devices/d1/history/table"]}>
          <React.Suspense fallback={null}>
            <Routes>
              <Route
                path="/devices/:deviceId/history"
                element={<DeviceHistoryLayout />}
              >
                <Route path="table" element={<div />} />
              </Route>
            </Routes>
          </React.Suspense>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  mockGetSeriesPoints.mockResolvedValue({
    points: [],
    truncated: false,
    next_start: null,
  });
  // The standard-type catalog; thermostat is the only entry the tests need.
  mockGetStandardTypes.mockResolvedValue([
    {
      key: "thermostat",
      name: "Thermostat",
      fields: [
        "temperature",
        "temperature_setpoint",
        "onoff_state",
        "mode",
        "fan_speed",
      ].map((name) => ({ name, required: false, data_type: "float" })),
    },
  ]);
});

afterEach(() => {
  cleanup();
  mockListSeries.mockReset();
  mockGetSeriesPoints.mockReset();
  mockGetStandardTypes.mockReset();
});

describe("DeviceHistoryLayout attribute selection", () => {
  it("fetches points only for the default-visible attributes", async () => {
    // A non-standard device has no standard schema, so the default falls back
    // to the first 8 attributes in declaration order.
    setupDevice(12);
    renderLayout();

    await screen.findByText("8 / 12");

    expect(mockGetSeriesPoints).toHaveBeenCalledTimes(8);
    const fetchedMetrics = mockGetSeriesPoints.mock.calls.map((c) => c[1]);
    expect(fetchedMetrics).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(attrName));
  });

  it("selects only a standard device's schema attributes by default", async () => {
    const standard = setupThermostat();
    renderLayout();

    // 10 fillers + 5 standard: exactly the 5 standard attributes are selected,
    // none of the fillers — the default is standard-only, not padded to a cap.
    await screen.findByText("5 / 15");

    const fetchedMetrics = mockGetSeriesPoints.mock.calls.map((c) => c[1]);
    expect([...fetchedMetrics].sort()).toEqual([...standard].sort());
  });

  it("fetches only the missing series when the selection grows", async () => {
    setupDevice(12);
    renderLayout();
    await screen.findByText("8 / 12");
    mockGetSeriesPoints.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByText("Attr 09"));

    await screen.findByText("9 / 12");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(1));
    expect(mockGetSeriesPoints.mock.calls[0][1]).toBe(attrName(8));
  });

  it("disables select-all when the device has too many attributes", async () => {
    setupDevice(25);
    renderLayout();
    await screen.findByText("8 / 25");

    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByText("Too many attributes")).toBeInTheDocument();
  });

  it("keeps select-all enabled at or below the threshold", async () => {
    setupDevice(12);
    renderLayout();
    await screen.findByText("8 / 12");

    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
  });

  it("filters the attribute list with the search input", async () => {
    setupDevice(8);
    renderLayout();
    await screen.findByText("8 / 8");

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search attributes…"), "06");

    expect(screen.getByText("Attr 06")).toBeInTheDocument();
    expect(screen.queryByText("Attr 01")).not.toBeInTheDocument();
  });
});
