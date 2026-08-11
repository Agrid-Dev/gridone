import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { DataPoint, Device, TimeSeries, UnitCommand } from "@gridone/sdk";
import { TooltipProvider } from "@/components/ui/tooltip";

const {
  mockListSeries,
  mockGetSeriesPoints,
  mockGetStandardTypes,
  mockAggregate,
} = vi.hoisted(() => ({
  mockListSeries: vi.fn(),
  mockGetSeriesPoints: vi.fn(),
  mockGetStandardTypes: vi.fn(),
  mockAggregate: vi.fn(),
}));

vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    timeseries: {
      list: (...args: unknown[]) => mockListSeries(...args),
      getPoints: (...args: unknown[]) => mockGetSeriesPoints(...args),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
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
    "attributes.temperature": "Température",
    "attributes.mode": "Mode",
    "history.metricsLabel": "Métriques",
    "history.more": "Plus…",
    "history.range24h": "24 h",
    "history.range7d": "7 j",
    "history.range30d": "30 j",
    "history.rangeCustom": "Personnalisé",
    "history.chartTitle24h": "{{metric}} — dernières 24 h",
    "history.chartTitleRange": "{{metric}} — {{range}}",
    "history.truncatedWarning": "Données tronquées, réduisez la période",
    "history.averagedNotice": "Moyenné par {{interval}}",
    "history.statesTitle": "États",
    "history.noMetricData": "Aucune donnée sur la période",
    "history.export": "Exporter",
    "devices:history.events.event": "Événement",
    "devices:history.events.value": "Valeur",
    "devices:history.events.source": "Source",
    "devices:history.events.reading": "Relevé — {{metric}}",
    "devices:history.events.change": "Changement — {{metric}}",
    "devices:history.events.gateway": "Passerelle",
    "devices:history.events.today": "aujourd'hui",
    "devices:history.events.yesterday": "hier",
    "common:common.timestamp": "Horodatage",
    "common:common.searchAttributes": "Search attributes…",
    "common:common.noResults": "No results",
    "common:common.noData": "No data",
    "common:common.rowsRange": "{{from}}–{{to}} / {{total}}",
    "common.hvacMode.heat": "Chauffage",
    "common.hvacMode.on": "Marche",
    "common.hvacMode.off": "Arrêt",
    "common.noData": "No data",
    "timeRange.rangeLastHours": "{{count}} dernières heures",
    "deviceDetails.noHistoryDescription": "No time-series recorded yet.",
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

const mockCommands = vi.hoisted(() => ({
  current: new Map<number, unknown>(),
}));
vi.mock("@/hooks/useCommandsByIds", () => ({
  useCommandsByIds: () => ({ commandsMap: mockCommands.current }),
}));

const mockUsers = vi.hoisted(() => ({ current: new Map<string, unknown>() }));
vi.mock("@/hooks/useUsers", () => ({
  useUsers: () => ({ usersMap: mockUsers.current }),
}));

import DeviceHistoryPage from "./DeviceHistoryPage";
import { RedirectToHistory } from "./RedirectToHistory";

function attrName(i: number) {
  return `attr_${String(i + 1).padStart(2, "0")}`;
}

function deviceOf(
  entries: { name: string; dataType: string }[],
  type: string | null,
) {
  mockDevice.current = {
    id: "d1",
    name: "Device",
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes: Object.fromEntries(
      entries.map(({ name, dataType }) => [
        name,
        {
          kind: "standard",
          name,
          data_type: dataType,
          read_write_modes: ["read"],
          current_value: null,
          last_updated: null,
          last_changed: null,
        },
      ]),
    ),
    is_faulty: false,
  } satisfies Device;

  const series: TimeSeries[] = entries.map(({ name, dataType }) => ({
    id: `s-${name}`,
    data_type: dataType as TimeSeries["data_type"],
    owner_id: "d1",
    metric: name,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
  mockListSeries.mockResolvedValue(series);
}

/** Untyped device exposing `count` float attributes. */
function setupDevice(count: number) {
  deviceOf(
    Array.from({ length: count }, (_, i) => ({
      name: attrName(i),
      dataType: "float",
    })),
    null,
  );
}

const THERMOSTAT_STANDARD = [
  { name: "temperature", dataType: "float" },
  { name: "temperature_setpoint", dataType: "float" },
  { name: "onoff_state", dataType: "bool" },
  { name: "mode", dataType: "str" },
  { name: "fan_speed", dataType: "str" },
];

/** Thermostat with filler numeric attributes declared before the schema. */
function setupThermostat() {
  const fillers = Array.from({ length: 10 }, (_, i) => ({
    name: `filler_${i + 1}`,
    dataType: "float",
  }));
  deviceOf([...fillers, ...THERMOSTAT_STANDARD], "thermostat");
}

/** Points served per metric; anything absent resolves empty. */
function servePoints(
  byMetric: Record<string, DataPoint[]>,
  { truncated = false } = {},
) {
  mockGetSeriesPoints.mockImplementation((_owner: string, metric: string) =>
    Promise.resolve({
      points: byMetric[metric] ?? [],
      truncated,
      next_start: null,
    }),
  );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">{location.pathname + location.search}</div>
  );
}

function renderPage(initialEntry = "/devices/d1/history") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <React.Suspense fallback={null}>
            <Routes>
              <Route
                path="/devices/:deviceId/history"
                element={
                  <>
                    <DeviceHistoryPage />
                    <LocationProbe />
                  </>
                }
              />
              <Route
                path="/devices/:deviceId/history/:view"
                element={<RedirectToHistory />}
              />
            </Routes>
          </React.Suspense>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function fetchedMetrics() {
  return mockGetSeriesPoints.mock.calls.map((c) => c[1] as string);
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Node 25 exposes a broken global localStorage; the app code guards
    // every access, so specs must not die on cleanup either.
  }
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  servePoints({});
  // Unusable stand-in ("whole" collapses the window): tests exercising the
  // averaged fallback override this with a real bucketed result.
  mockAggregate.mockResolvedValue({
    interval: "whole",
    agg: "tw_avg",
    data_type: "float",
    timezone: "UTC",
    points: [],
    truncated: false,
  });
  mockCommands.current = new Map();
  mockUsers.current = new Map();
  mockGetStandardTypes.mockResolvedValue([
    {
      key: "thermostat",
      name: "Thermostat",
      fields: THERMOSTAT_STANDARD.map(({ name, dataType }) => ({
        name,
        required: false,
        data_type: dataType,
      })),
    },
  ]);
});

afterEach(() => {
  cleanup();
  mockListSeries.mockReset();
  mockGetSeriesPoints.mockReset();
  mockGetStandardTypes.mockReset();
  mockAggregate.mockReset();
});

describe("DeviceHistoryPage metric pills", () => {
  it("defaults to the first standard numeric attribute and fetches it with the state series", async () => {
    setupThermostat();
    renderPage();

    const pill = await screen.findByRole("button", { name: "Température" });
    expect(pill).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(4));
    expect([...fetchedMetrics()].sort()).toEqual([
      "fan_speed",
      "mode",
      "onoff_state",
      "temperature",
    ]);
  });

  it("switching pills fetches only the missing series", async () => {
    setupThermostat();
    renderPage();
    await screen.findByRole("button", { name: "Température" });
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(4));
    mockGetSeriesPoints.mockClear();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Temperature Setpoint" }),
    );

    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(1));
    expect(fetchedMetrics()).toEqual(["temperature_setpoint"]);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "metric=temperature_setpoint",
    );
  });

  it("promotes a metric picked in the More… list to a temporary active pill", async () => {
    setupThermostat();
    renderPage();
    await screen.findByRole("button", { name: "Température" });

    const user = userEvent.setup();
    await user.click(screen.getByText("Filler 3"));

    const pill = await screen.findByRole("button", { name: "Filler 3" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("location")).toHaveTextContent("metric=filler_3");
    await waitFor(() => expect(fetchedMetrics()).toContain("filler_3"));
  });

  it("falls back to the default when ?metric= is unknown", async () => {
    setupThermostat();
    renderPage("/devices/d1/history?metric=bogus");

    const pill = await screen.findByRole("button", { name: "Température" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(fetchedMetrics()).toContain("temperature"));
    expect(fetchedMetrics()).not.toContain("bogus");
  });

  it("hides the pills and keeps the state timelines on a state-only device", async () => {
    deviceOf([{ name: "mode", dataType: "str" }], null);
    servePoints({
      mode: [
        {
          timestamp: new Date(Date.now() - 3600_000).toISOString(),
          value: "heat",
        },
        {
          timestamp: new Date(Date.now() - 600_000).toISOString(),
          value: "auto",
        },
      ],
    });
    renderPage();

    await screen.findByText("Chauffage");
    expect(
      screen.queryByRole("group", { name: "Métriques" }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the first numeric attributes on an untyped device", async () => {
    setupDevice(12);
    renderPage();

    const pill = await screen.findByRole("button", { name: "Attr 01" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(1));
    expect(fetchedMetrics()).toEqual([attrName(0)]);
  });
});

describe("DeviceHistoryPage range control", () => {
  it("writes ?last and resets the page param when a segment is picked", async () => {
    setupThermostat();
    renderPage("/devices/d1/history?page=3");
    await screen.findByRole("button", { name: "Température" });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "7 j" }));

    const location = screen.getByTestId("location");
    expect(location).toHaveTextContent("last=7d");
    expect(location).not.toHaveTextContent("page=");
  });

  it("lights the custom segment for an off-ladder preset", async () => {
    setupThermostat();
    renderPage("/devices/d1/history?last=3h");

    const custom = await screen.findByRole("button", {
      name: "3 dernières heures",
    });
    expect(custom).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DeviceHistoryPage truncation", () => {
  it("shows a warning when the API truncated a series", async () => {
    setupThermostat();
    servePoints({}, { truncated: true });
    renderPage();

    await screen.findByText("Données tronquées, réduisez la période");
  });

  it("charts auto-bucketed averages when the metric is truncated", async () => {
    setupDevice(1);
    const t1 = new Date(Date.now() - 3600_000).toISOString();
    servePoints(
      { [attrName(0)]: [{ timestamp: t1, value: 21 }] },
      { truncated: true },
    );
    mockAggregate.mockResolvedValue({
      interval: "1h",
      agg: "tw_avg",
      data_type: "float",
      timezone: "UTC",
      truncated: false,
      points: [{ interval_start: t1, value: 21.4, count: 360 }],
    });
    renderPage();

    await screen.findByText("Moyenné par 1h");
    // The averaged stand-in absorbs the truncation: no warning left.
    expect(
      screen.queryByText("Données tronquées, réduisez la période"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockAggregate).toHaveBeenCalledWith(
        "d1",
        attrName(0),
        expect.objectContaining({ agg: "tw_avg", interval: "auto" }),
      ),
    );
  });

  it("keeps raw points and requests no aggregate when nothing truncates", async () => {
    setupDevice(1);
    const t1 = new Date(Date.now() - 3600_000).toISOString();
    servePoints({ [attrName(0)]: [{ timestamp: t1, value: 21 }] });
    renderPage();

    await screen.findByRole("button", { name: "Attr 01" });
    await waitFor(() => expect(fetchedMetrics()).toContain(attrName(0)));
    expect(mockAggregate).not.toHaveBeenCalled();
    expect(screen.queryByText(/Moyenné par/)).not.toBeInTheDocument();
  });
});

describe("DeviceHistoryPage events table", () => {
  it("renders readings and state changes with their sources", async () => {
    setupThermostat();
    const t1 = new Date(Date.now() - 3600_000).toISOString();
    const t2 = new Date(Date.now() - 600_000).toISOString();
    servePoints({
      temperature: [
        { timestamp: t1, value: 20.5 },
        { timestamp: t2, value: 22.6, command_id: 7 },
      ],
      mode: [{ timestamp: t1, value: "heat" }],
    });
    mockCommands.current = new Map([
      [
        7,
        {
          id: 7,
          device_id: "d1",
          attribute: "temperature",
          value: 22.6,
          data_type: "float",
          user_id: "u1",
          status: "success",
          created_at: t2,
        } as UnitCommand,
      ],
    ]);
    mockUsers.current = new Map([["u1", { id: "u1", name: "Alice Doe" }]]);
    renderPage();

    expect((await screen.findAllByText("Relevé — Température")).length).toBe(2);
    expect(screen.getByText("Changement — Mode")).toBeInTheDocument();
    // Also matches the command popover's old→new line (mocked always-open).
    expect(screen.getAllByText("20.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Passerelle").length).toBe(2);
    // Name shows in the source cell and again in the command popover.
    expect(screen.getAllByText("Alice Doe").length).toBeGreaterThan(0);
  });

  it("paginates past twenty events", async () => {
    setupThermostat();
    const base = Date.now() - 3600_000;
    servePoints({
      temperature: Array.from({ length: 25 }, (_, i) => ({
        timestamp: new Date(base + i * 60_000).toISOString(),
        value: 20 + i,
      })),
    });
    renderPage();

    await screen.findByText("1 / 2");
    expect(screen.getByText("1–20 / 25")).toBeInTheDocument();
  });
});

describe("DeviceHistoryPage empty state", () => {
  it("shows the empty state when the device records nothing", async () => {
    setupThermostat();
    mockListSeries.mockResolvedValue([]);
    renderPage();

    await screen.findByText("No time-series recorded yet.");
  });
});

describe("history sub-route redirects", () => {
  it.each(["chart", "table"])(
    "redirects /history/%s to /history with the query preserved",
    async (view) => {
      setupThermostat();
      renderPage(`/devices/d1/history/${view}?last=7d&metric=temperature`);

      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent(
          "/devices/d1/history?last=7d&metric=temperature",
        ),
      );
    },
  );
});
