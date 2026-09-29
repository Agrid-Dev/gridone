import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import type { DataPoint, Device, TimeSeries, UnitCommand } from "@gridone/sdk";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock react-spring before any visx imports — prevents jsdom crashes
vi.mock("@react-spring/web", () => import("@/test/react-spring-mock"));

// jsdom lays nothing out, so the chart's own measurement yields a width of 0
// and it renders nothing; give it a width so the panels exist.
vi.mock("@visx/responsive", () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => <>{children({ width: 800, height: 400 })}</>,
}));

const {
  mockListSeries,
  mockGetSeriesPoints,
  mockGetStandardTypes,
  mockExportCsv,
  mockExportPng,
  mockToastError,
} = vi.hoisted(() => ({
  mockListSeries: vi.fn(),
  mockGetSeriesPoints: vi.fn(),
  mockGetStandardTypes: vi.fn(),
  mockExportCsv: vi.fn(),
  mockExportPng: vi.fn(),
  mockToastError: vi.fn(),
}));

// No `aggregate` on purpose: the page never averages anything on its own.
vi.mock("@/contexts/GridoneClientContext", () => ({
  useGridoneClient: () => ({
    timeseries: {
      list: (...args: unknown[]) => mockListSeries(...args),
      getPoints: (...args: unknown[]) => mockGetSeriesPoints(...args),
      exportCsv: (...args: unknown[]) => mockExportCsv(...args),
      exportPng: (...args: unknown[]) => mockExportPng(...args),
    },
    devices: {
      getStandardTypes: (...args: unknown[]) => mockGetStandardTypes(...args),
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}));

vi.mock("react-i18next", () =>
  createI18nMock({
    "attributes.temperature": "Température",
    "attributes.humidity": "Humidité",
    "attributes.mode": "Mode",
    "history.chart": "Graphique",
    "history.table": "Tableau",
    "history.range24h": "24 h",
    "history.range7d": "7 j",
    "history.range30d": "30 j",
    "history.rangeCustom": "Personnalisé",
    "history.truncatedWarning":
      "Données tronquées pour {{attributes}}, réduisez la période",
    "history.noAttributesSelected": "Sélectionnez des attributs à tracer",
    "history.noMetricData": "Aucune donnée sur la période",
    "history.export": "Exporter",
    "devices:history.today": "aujourd'hui",
    "devices:history.yesterday": "hier",
    "deviceDetails.downloadCsv": "Télécharger en CSV",
    "deviceDetails.downloadPng": "Télécharger en PNG",
    "deviceDetails.downloadCsvError": "Échec de l'export CSV",
    "deviceDetails.downloadPngError": "Échec de l'export PNG",
    "deviceDetails.noHistoryDescription": "No time-series recorded yet.",
    "commands.status": "Statut",
    "common:common.columns": "Attributs",
    "common:common.searchAttributes": "Rechercher un attribut…",
    "common:common.selectAll": "Tout sélectionner",
    "common:common.unselectAll": "Tout désélectionner",
    "common:common.selectAllDisabledHint": "Trop d'attributs",
    "common:common.timestamp": "Horodatage",
    "common:common.noResults": "No results",
    "common:common.noData": "No data",
    "common:common.rowsRange": "{{from}}–{{to}} / {{total}}",
    "common.hvacMode.heat": "Chauffage",
    "common.hvacMode.cool": "Refroidissement",
    "common.true": "Vrai",
    "common.false": "Faux",
    "common.hvacMode.on": "Marche",
    "common.hvacMode.off": "Arrêt",
    "timeRange.rangeLastHours": "{{count}} dernières heures",
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

import { deviceHistoryRoutes } from "./routes";
import { exportFilename } from "./DeviceHistoryContext";

function attrName(i: number) {
  return `attr_${String(i + 1).padStart(2, "0")}`;
}

type Entry = {
  name: string;
  dataType: string;
  valueLabels?: unknown;
  unit?: string;
  label?: { default: string };
  kind?: "standard" | "fault";
  severity?: string;
  healthyValues?: unknown[];
};

/** A device exposing `entries`, each with a recorded series. `hiddenSeries`
 *  are recorded too but absent from the device's declared attributes. */
function deviceOf(
  entries: Entry[],
  type: string | null,
  { hiddenSeries = [] as string[] } = {},
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
      entries.map(
        ({
          name,
          dataType,
          valueLabels,
          unit,
          label,
          kind = "standard",
          severity,
          healthyValues,
        }) => [
          name,
          {
            kind,
            name,
            data_type: dataType,
            read_write_modes: ["read"],
            current_value: null,
            last_updated: null,
            last_changed: null,
            value_labels: valueLabels,
            unit,
            label,
            severity,
            healthy_values: healthyValues,
          },
        ],
      ),
    ),
    is_faulty: false,
  } satisfies Device;

  const series: TimeSeries[] = [
    ...entries.map(({ name, dataType }) => ({ name, dataType })),
    ...hiddenSeries.map((name) => ({ name, dataType: "float" })),
  ].map(({ name, dataType }) => ({
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

/** Points served per metric; anything absent resolves empty. `truncated`
 *  flags every metric, or only the ones named. */
function servePoints(
  byMetric: Record<string, DataPoint[]>,
  { truncated = false as boolean | string[] } = {},
) {
  mockGetSeriesPoints.mockImplementation((_owner: string, metric: string) =>
    Promise.resolve({
      points: byMetric[metric] ?? [],
      truncated: Array.isArray(truncated)
        ? truncated.includes(metric)
        : truncated,
      next_start: null,
    }),
  );
}

const anHourAgo = () => new Date(Date.now() - 3600_000).toISOString();
const tenMinutesAgo = () => new Date(Date.now() - 600_000).toISOString();

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
              <Route path="/devices/:deviceId">{deviceHistoryRoutes}</Route>
            </Routes>
            <LocationProbe />
          </React.Suspense>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function fetchedMetrics() {
  return mockGetSeriesPoints.mock.calls.map((c) => c[1] as string);
}

/** The attribute selector's list. */
function selector() {
  return within(screen.getByRole("listbox"));
}

/** Hover the middle of the chart; returns the unified tooltip. */
function hoverChart(container: HTMLElement): Element {
  const wrapper = container
    .querySelector('svg[aria-label="XYChart"]')!
    .closest<HTMLElement>('div[style*="position: relative"]')!;
  wrapper.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  fireEvent.pointerMove(wrapper, { clientX: 400, clientY: 100 });
  return wrapper.querySelector(".bg-popover")!;
}

function valueAxes(container: HTMLElement) {
  return container.querySelectorAll("g.visx-axis-value");
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // Node 25 exposes a broken global localStorage; the app code guards
    // every access, so specs must not die on cleanup either.
  }
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.URL.createObjectURL ??= vi.fn(() => "blob:history");
  window.URL.revokeObjectURL ??= vi.fn();
  servePoints({});
  mockExportCsv.mockResolvedValue("timestamp,value\r\n");
  mockExportPng.mockResolvedValue(new Blob());
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
  mockExportCsv.mockReset();
  mockExportPng.mockReset();
  mockToastError.mockReset();
});

describe("DeviceHistoryPage selection", () => {
  it("selects the device's standard attributes on first visit and fetches only them", async () => {
    setupThermostat();
    renderPage();

    await screen.findByText("5 / 15");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(5));
    expect([...fetchedMetrics()].sort()).toEqual([
      "fan_speed",
      "mode",
      "onoff_state",
      "temperature",
      "temperature_setpoint",
    ]);
    // The default selection leaves the URL bare.
    expect(screen.getByTestId("location")).not.toHaveTextContent("attrs=");
  });

  it("falls back to the first recorded attributes on an untyped device", async () => {
    setupDevice(12);
    renderPage();

    await screen.findByText("8 / 12");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(8));
    expect(fetchedMetrics()).toEqual(
      Array.from({ length: 8 }, (_, i) => attrName(i)),
    );
  });

  it("adds an attribute without dropping the others, fetching only the new one", async () => {
    setupThermostat();
    renderPage();
    await screen.findByText("5 / 15");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(5));
    mockGetSeriesPoints.mockClear();

    const user = userEvent.setup();
    await user.click(selector().getByText("Filler 3"));

    await screen.findByText("6 / 15");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(1));
    expect(fetchedMetrics()).toEqual(["filler_3"]);
    // The URL carries the whole selection, in device order.
    expect(screen.getByTestId("location")).toHaveTextContent(
      "attrs=filler_3%2Ctemperature%2Ctemperature_setpoint%2Conoff_state%2Cmode%2Cfan_speed",
    );
  });

  it("removes only the attribute deselected", async () => {
    setupThermostat();
    renderPage();
    await screen.findByText("5 / 15");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(5));
    mockGetSeriesPoints.mockClear();

    const user = userEvent.setup();
    await user.click(selector().getByText("Température"));

    await screen.findByText("4 / 15");
    expect(screen.getByTestId("location")).toHaveTextContent(
      "attrs=temperature_setpoint%2Conoff_state%2Cmode%2Cfan_speed",
    );
    expect(mockGetSeriesPoints).not.toHaveBeenCalled();
  });

  it("reproduces the selection a link carries", async () => {
    setupThermostat();
    renderPage("/devices/d1/history/chart?attrs=filler_1,mode");

    await screen.findByText("2 / 15");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(2));
    expect(fetchedMetrics()).toEqual(["filler_1", "mode"]);
  });

  it("drops names the device never recorded", async () => {
    setupThermostat();
    renderPage("/devices/d1/history/chart?attrs=bogus,temperature");

    await screen.findByText("1 / 15");
    await waitFor(() => expect(fetchedMetrics()).toEqual(["temperature"]));
    expect(selector().queryByText("Bogus")).toBeNull();
  });

  it("offers a recorded series the device no longer declares, after the declared ones", async () => {
    // The series list is what the API exposes to this user (role scoping
    // applies there); a removed or renamed driver attribute keeps its history.
    deviceOf([...THERMOSTAT_STANDARD], "thermostat", {
      hiddenSeries: ["legacy_attr"],
    });
    renderPage("/devices/d1/history/chart?attrs=legacy_attr");

    await screen.findByText("1 / 6");
    await waitFor(() => expect(fetchedMetrics()).toEqual(["legacy_attr"]));
    const options = selector()
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options[options.length - 1]).toBe("Legacy Attr");
  });

  it("opens on the attribute an older ?metric= link names", async () => {
    setupThermostat();
    renderPage("/devices/d1/history?metric=filler_3&last=7d");

    await screen.findByText("1 / 15");
    await waitFor(() => expect(fetchedMetrics()).toEqual(["filler_3"]));
  });

  it("offers every recorded attribute, text and booleans included", async () => {
    setupThermostat();
    renderPage();
    await screen.findByText("5 / 15");

    const options = selector()
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toHaveLength(15);
    expect(options).toEqual(
      expect.arrayContaining(["Onoff State", "Mode", "Fan Speed"]),
    );
  });

  it("disables select-all past the threshold but keeps every attribute selectable", async () => {
    setupDevice(25);
    renderPage();
    await screen.findByText("8 / 25");

    expect(
      screen.getByRole("button", { name: "Tout sélectionner" }),
    ).toBeDisabled();
    expect(screen.getByText("Trop d'attributs")).toBeInTheDocument();
    expect(selector().getAllByRole("option")).toHaveLength(25);

    const user = userEvent.setup();
    await user.click(selector().getByText("Attr 25"));
    await screen.findByText("9 / 25");
  });

  it("filters the attribute list with the search input", async () => {
    setupDevice(12);
    renderPage();
    await screen.findByText("8 / 12");

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("Rechercher un attribut…"),
      "06",
    );

    expect(selector().getByText("Attr 06")).toBeInTheDocument();
    expect(selector().queryByText("Attr 01")).toBeNull();
  });

  it("remembers the selection for the next visit", async () => {
    setupThermostat();
    const first = renderPage();
    await screen.findByText("5 / 15");
    const user = userEvent.setup();
    await user.click(selector().getByText("Filler 3"));
    await screen.findByText("6 / 15");
    first.unmount();

    renderPage();
    await screen.findByText("6 / 15");
    // The remembered selection is seeded into the URL by an effect that
    // lands a render after the badge.
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "attrs=filler_3%2C",
      ),
    );
  });
});

describe("DeviceHistoryPage views", () => {
  it("opens on the chart and keeps the query when switching to the table", async () => {
    setupThermostat();
    renderPage("/devices/d1/history?last=7d");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/devices/d1/history/chart?last=7d",
      ),
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Tableau" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/devices/d1/history/table?last=7d",
    );
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });
});

describe("DeviceHistoryPage chart", () => {
  it("charts every selected numeric attribute at once, one panel per unit", async () => {
    deviceOf(
      [
        { name: "temperature", dataType: "float" },
        { name: "humidity", dataType: "float" },
      ],
      null,
    );
    const t1 = anHourAgo();
    servePoints({
      temperature: [{ timestamp: t1, value: 20.5 }],
      humidity: [{ timestamp: t1, value: 45 }],
    });
    const { container } = renderPage();

    await waitFor(() => expect(valueAxes(container)).toHaveLength(2));
    const tooltip = hoverChart(container);
    expect(tooltip.textContent).toContain("Température 20.50 °");
    expect(tooltip.textContent).toContain("Humidité 45.00 %");
  });

  it("labels the axis with the unit the driver declares", async () => {
    deviceOf([{ name: "pressure", dataType: "float", unit: "bar" }], null);
    servePoints({ pressure: [{ timestamp: anHourAgo(), value: 1.5 }] });
    const { container } = renderPage();

    await waitFor(() => expect(valueAxes(container)).toHaveLength(1));
    const ticks = Array.from(valueAxes(container)[0].querySelectorAll("text"));
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((tick) => tick.textContent?.endsWith("bar"))).toBe(true);
  });

  it("reads numeric, boolean and text states at the same instant, worded from the driver", async () => {
    deviceOf(
      [
        { name: "temperature", dataType: "float" },
        {
          name: "onoff_state",
          dataType: "bool",
          valueLabels: [
            { value: false, label: { default: "Arrêt technique" } },
            { value: true, label: { default: "Marche technique" } },
          ],
        },
        { name: "mode", dataType: "str" },
      ],
      null,
    );
    const t1 = anHourAgo();
    servePoints({
      temperature: [{ timestamp: t1, value: 20.5 }],
      onoff_state: [{ timestamp: t1, value: true }],
      mode: [{ timestamp: t1, value: "heat" }],
    });
    const { container } = renderPage();

    await waitFor(() => expect(valueAxes(container)).toHaveLength(1));
    const tooltip = hoverChart(container);
    expect(tooltip.textContent).toContain("Température 20.50 °");
    expect(tooltip.textContent).toContain("Marche technique");
    expect(tooltip.textContent).toContain("Chauffage");
    expect(tooltip.textContent).not.toMatch(/true|heat/);
  });

  it("says when nothing is selected", async () => {
    setupThermostat();
    renderPage("/devices/d1/history/chart?attrs=");

    await screen.findByText("Sélectionnez des attributs à tracer");
    await screen.findByText("0 / 15");
    expect(mockGetSeriesPoints).not.toHaveBeenCalled();
  });
});

describe("DeviceHistoryPage truncation", () => {
  it.each(["chart", "table"])(
    "warns on the %s view which attributes were truncated, and never averages",
    async (view) => {
      setupThermostat();
      servePoints({}, { truncated: true });
      renderPage(`/devices/d1/history/${view}?attrs=temperature,mode`);

      expect(await screen.findByRole("status")).toHaveTextContent(
        "Données tronquées pour Température, Mode, réduisez la période",
      );
    },
  );

  it("stops a truncated attribute at its last fetched point instead of carrying it on", async () => {
    setupThermostat();
    const t1 = anHourAgo();
    const t2 = tenMinutesAgo();
    servePoints(
      {
        temperature: [{ timestamp: t1, value: 20.5 }],
        mode: [
          { timestamp: t1, value: "heat" },
          { timestamp: t2, value: "auto" },
        ],
      },
      { truncated: ["temperature"] },
    );
    renderPage("/devices/d1/history/table?attrs=temperature,mode");

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    // Newest first: at t2 the temperature is unknown, not "still 20.5".
    expect(rows[0]).toHaveTextContent("—");
    expect(rows[0]).not.toHaveTextContent("20.50 °");
    expect(rows[1]).toHaveTextContent("20.50 °");
  });
});

describe("DeviceHistoryPage table", () => {
  it("compares the selected attributes side by side at each instant", async () => {
    setupThermostat();
    const t1 = anHourAgo();
    const t2 = tenMinutesAgo();
    servePoints({
      temperature: [
        { timestamp: t1, value: 20.5 },
        { timestamp: t2, value: 22.6 },
      ],
      mode: [{ timestamp: t1, value: "heat" }],
    });
    renderPage("/devices/d1/history/table?attrs=temperature,mode");

    const table = await screen.findByRole("table");
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual(["Horodatage", "Température", "Mode"]);
    // Two instants, both listing every column: the mode in force at t2 is
    // the one set at t1, carried over.
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("22.60 °")).toBeInTheDocument();
    expect(within(table).getByText("20.50 °")).toBeInTheDocument();
    expect(within(table).getAllByText("Chauffage")).toHaveLength(2);
    // The mode reads as on the supervision pages: its HVAC icon beside it.
    const modeCell = within(table).getAllByText("Chauffage")[0].parentElement!;
    expect(modeCell.querySelector("svg")).not.toBeNull();
  });

  it("tones a fault attribute's past values by severity, as the supervision pages do", async () => {
    deviceOf(
      [
        {
          name: "filter_alarm",
          dataType: "bool",
          kind: "fault",
          severity: "warning",
          healthyValues: [false],
          valueLabels: [
            { value: true, label: { default: "Filtre encrassé" } },
            { value: false, label: { default: "Filtre sain" } },
          ],
        },
      ],
      null,
    );
    servePoints({
      filter_alarm: [
        { timestamp: anHourAgo(), value: true },
        { timestamp: tenMinutesAgo(), value: false },
      ],
    });
    renderPage("/devices/d1/history/table");

    const table = await screen.findByRole("table");
    const toneOf = (label: string) =>
      within(table)
        .getByText(label)
        .parentElement!.querySelector("[data-tone]")!
        .getAttribute("data-tone");
    expect(toneOf("Filtre encrassé")).toBe("warning");
    expect(toneOf("Filtre sain")).toBe("ok");
  });

  it("names attributes as their driver labels them", async () => {
    deviceOf(
      [
        {
          name: "t_corridor",
          dataType: "float",
          label: { default: "Sonde couloir" },
        },
      ],
      null,
    );
    servePoints({ t_corridor: [{ timestamp: anHourAgo(), value: 19.5 }] });
    renderPage("/devices/d1/history/table");

    const table = await screen.findByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Sonde couloir" }),
    ).toBeInTheDocument();
    expect(selector().getByText("Sonde couloir")).toBeInTheDocument();
    expect(screen.queryByText("T Corridor")).toBeNull();
  });

  it("words a boolean change from the driver, never as On / Off", async () => {
    deviceOf(
      [
        {
          name: "onoff_state",
          dataType: "bool",
          valueLabels: [
            { value: false, label: { default: "Arrêt" } },
            { value: true, label: { default: "Marche technique" } },
          ],
        },
        { name: "presence_tension", dataType: "bool" },
      ],
      null,
    );
    const t1 = anHourAgo();
    servePoints({
      onoff_state: [{ timestamp: t1, value: true }],
      presence_tension: [{ timestamp: t1, value: true }],
    });
    renderPage("/devices/d1/history/table");

    const table = await screen.findByRole("table");
    // The declared label for the attribute that has one, the localized True
    // for the one that does not.
    expect(within(table).getByText("Marche technique")).toBeInTheDocument();
    expect(within(table).getByText("Vrai")).toBeInTheDocument();
    // "Marche" on its own is the On / Off wording the drivers never declared.
    expect(screen.queryByText("Marche")).toBeNull();
  });

  it("marks a value written by a command with its author, values and status", async () => {
    setupThermostat();
    const t1 = anHourAgo();
    const t2 = tenMinutesAgo();
    servePoints({
      temperature: [
        { timestamp: t1, value: 20.5 },
        { timestamp: t2, value: 22.6, command_id: 7 },
      ],
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
    renderPage("/devices/d1/history/table?attrs=temperature");

    const table = await screen.findByRole("table");
    // The indicator sits in the cell of the written value; its popover
    // (mocked always-open) names the author, the change and the outcome.
    expect(
      within(table).getByRole("button", { name: "Alice Doe" }),
    ).toHaveTextContent("AD");
    expect(within(table).getByText("Alice Doe")).toBeInTheDocument();
    expect(within(table).getAllByText("20.50 °").length).toBe(2);
    expect(within(table).getAllByText("22.60 °").length).toBe(2);
    expect(within(table).getByText("success")).toBeInTheDocument();
  });

  it("stamps rows with seconds so same-minute changes stay distinct", async () => {
    setupThermostat();
    const base = Date.now() - 3600_000;
    servePoints({
      temperature: [
        { timestamp: new Date(base).toISOString(), value: 20.5 },
        { timestamp: new Date(base + 10_000).toISOString(), value: 20.7 },
      ],
    });
    renderPage("/devices/d1/history/table?attrs=temperature");

    const table = await screen.findByRole("table");
    await waitFor(() =>
      expect(
        new Set(
          within(table)
            .getAllByText(/\d{1,2}:\d{2}:\d{2}/)
            .map((cell) => cell.textContent),
        ).size,
      ).toBe(2),
    );
  });

  it("paginates past twenty rows", async () => {
    setupThermostat();
    const base = Date.now() - 3600_000;
    servePoints({
      temperature: Array.from({ length: 25 }, (_, i) => ({
        timestamp: new Date(base + i * 60_000).toISOString(),
        value: 20 + i,
      })),
    });
    renderPage("/devices/d1/history/table?attrs=temperature");

    await screen.findByText("1 / 2");
    expect(screen.getByText("1–20 / 25")).toBeInTheDocument();
  });
});

describe("DeviceHistoryPage range control", () => {
  it("writes ?last and resets the page param when a segment is picked", async () => {
    setupThermostat();
    renderPage("/devices/d1/history/table?page=3");
    await screen.findByText("5 / 15");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "7 j" }));

    const location = screen.getByTestId("location");
    expect(location).toHaveTextContent("last=7d");
    expect(location).not.toHaveTextContent("page=");
  });

  it("lights the custom segment for an off-ladder preset", async () => {
    setupThermostat();
    renderPage("/devices/d1/history/chart?last=3h");

    const custom = await screen.findByRole("button", {
      name: "3 dernières heures",
    });
    expect(custom).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DeviceHistoryPage export", () => {
  it("names files after the device and window", () => {
    expect(exportFilename("Ch. Étage 2", { last: "1d" })).toBe(
      "ch-etage-2-history-1d",
    );
    expect(
      exportFilename("Chiller 0", {
        start: "2026-08-01T00:00:00Z",
        end: "2026-08-11T00:00:00Z",
      }),
    ).toBe("chiller-0-history-2026-08-01_2026-08-11");
    expect(exportFilename("†††", {})).toBe("device-history-all");
  });

  it.each([
    ["CSV", mockExportCsv],
    ["PNG", mockExportPng],
  ])("exports the whole selection as %s", async (format, exporter) => {
    setupThermostat();
    renderPage("/devices/d1/history/chart?attrs=temperature,mode&last=7d");
    await screen.findByText("2 / 15");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Exporter" }));
    await user.click(
      await screen.findByRole("menuitem", { name: `Télécharger en ${format}` }),
    );

    await waitFor(() =>
      expect(exporter).toHaveBeenCalledWith(
        expect.objectContaining({
          series_ids: ["s-temperature", "s-mode"],
          last: "7d",
        }),
      ),
    );
  });

  it.each([
    ["CSV", mockExportCsv, "Échec de l'export CSV"],
    ["PNG", mockExportPng, "Échec de l'export PNG"],
  ])("toasts when the %s export fails", async (format, exporter, message) => {
    setupThermostat();
    exporter.mockRejectedValue(new Error("boom"));
    renderPage();
    await screen.findByText("5 / 15");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Exporter" }));
    await user.click(
      await screen.findByRole("menuitem", { name: `Télécharger en ${format}` }),
    );

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith(message));
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
