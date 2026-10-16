import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { Asset, FaultEpisode } from "@gridone/sdk";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createI18nMock } from "@/test/i18nMock";
import { inTimeZone } from "@/test/timeZone";

vi.mock("react-i18next", () =>
  createI18nMock({
    "faults.title": "Alerts",
    "faults.export": "Export",
    "faults.tabs.label": "Alerts",
    "faults.tabs.live": "Ongoing",
    "faults.tabs.history": "History",
    "faults.columns.device": "Device",
    "faults.columns.zone": "Zone",
    "faults.columns.fault": "Alert",
    "faults.columns.severity": "Severity",
    "faults.span.1d": "over 24 hours",
    "faults.span.7d": "over 7 days",
    "faults.span.custom": "over this period",
    "faults.recurrence": "{{count}} times {{span}}",
    "faults.history.caption": "Every alert of the period",
    "faults.history.views.label": "Show",
    "faults.history.views.byDay": "Timeline",
    "faults.history.views.byDevice": "By device",
    "faults.history.severities.label": "Severity",
    "faults.history.severities.all": "All",
    "faults.history.search.label": "Search alerts",
    "faults.history.figures.count": "Alerts {{span}}",
    "faults.history.figures.ongoing": "{{count}} still ongoing",
    "faults.history.figures.allEnded": "all ended",
    "faults.history.figures.duration": "Time in alert",
    "faults.history.figures.mostFrequent": "Most frequent",
    "faults.history.figures.mostFrequentNote": "{{device}} · {{count}} times",
    "faults.history.columns.range": "Start → end",
    "faults.history.columns.duration": "Duration",
    "faults.history.columns.lastTime": "Last time",
    "faults.history.columns.total": "Total",
    "faults.history.columns.count": "Times",
    "faults.history.dayCount": "{{count}} alerts",
    "faults.history.today": "aujourd'hui",
    "faults.history.yesterday": "hier",
    "faults.history.ongoing": "en cours",
    "faults.history.since": "depuis {{duration}}",
    "faults.history.stillOn": "ongoing right now",
    "faults.history.deviceHistory": "History of the device",
    "faults.history.byDayFooter": "{{count}} alerts {{span}}",
    "faults.history.byDeviceFooter": "{{count}} different alerts {{span}}",
    "faults.history.truncated": "Some changes may be missing",
    "faults.history.emptyTitle": "No alerts over this period",
    "faults.history.filteredEmpty": "No alerts match these filters",
    "faults.history.clearFilters": "Clear filters",
    "faults.history.unableToLoad": "Unable to load the alert history",
    "faults.history.exportFilenameStem": "alert-history",
    "faults.history.csv.start": "Start",
    "faults.history.csv.end": "End",
    "faults.history.csv.durationMinutes": "Duration (min)",
    "faults.history.csv.lastTime": "Last time",
    "faults.history.csv.totalMinutes": "Total (min)",
    "faults.history.csv.count": "Times",
    "common.severity.alert": "critique",
    "common.severity.warning": "avertissement",
    "common.severity.info": "info",
    "common.compactDuration.minutes": "{{value}} min",
    "common.compactDuration.hours": "{{value}} h",
    "common.compactDuration.hoursMinutes": "{{hours}} h {{minutes}}",
    "timeRange.segment24h": "24 h",
    "timeRange.segment7d": "7 j",
    "timeRange.segment30d": "30 j",
    "timeRange.segmentCustom": "Personnalisé",
    "thermostat.name": "Thermostat",
  }),
);

const mockUseFaultEpisodes = vi.fn();
vi.mock("@/hooks/useFaultEpisodes", () => ({
  useFaultEpisodes: (...args: unknown[]) => mockUseFaultEpisodes(...args),
}));

const mockUseFaultsList = vi.fn();
vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => mockUseFaultsList(),
}));

const mockUseAssetTree = vi.fn();
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => mockUseAssetTree(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  usePermissions: () => () => true,
}));

const mockDownloadCsv = vi.fn();
vi.mock("@/lib/csv", () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));

import FaultHistoryPage from "./FaultHistoryPage";

/** Wednesday 14 October 2026, 14:40 in Martinique (UTC-4), where every local
 *  time below is read. */
const NOW = new Date("2026-10-14T18:40:00Z");
const PERIOD = {
  start: Date.parse("2026-10-07T18:40:00Z"),
  end: NOW.getTime(),
};

const WINDOW_LABEL = {
  default: "Window open",
  translations: { fr: "Fenêtre ouverte" },
};

function makeEpisode(overrides: Partial<FaultEpisode>): FaultEpisode {
  return {
    device_id: "room-203",
    device_name: "Chambre 203",
    device_type: "thermostat",
    attribute_name: "window_open",
    data_type: "bool",
    severity: "warning",
    label: WINDOW_LABEL,
    value: true,
    started_at: "2026-10-14T17:30:00Z",
    ended_at: null,
    ...overrides,
  };
}

/** Newest first, as the API sends them. */
const EPISODES: FaultEpisode[] = [
  // Today 13:30, still open.
  makeEpisode({}),
  // Today 08:12, a heat pump fault code, still open.
  makeEpisode({
    device_id: "pac",
    device_name: "Pompe à chaleur",
    device_type: null,
    attribute_name: "fault_code",
    data_type: "int",
    severity: "alert",
    label: null,
    value: 3,
    started_at: "2026-10-14T12:12:00Z",
  }),
  // Today 07:12 → 07:58.
  makeEpisode({
    started_at: "2026-10-14T11:12:00Z",
    ended_at: "2026-10-14T11:58:00Z",
  }),
  // Yesterday 16:47 → 17:10.
  makeEpisode({
    started_at: "2026-10-13T20:47:00Z",
    ended_at: "2026-10-13T21:10:00Z",
  }),
  // Monday 12 October 09:15 → 09:23.
  makeEpisode({
    device_id: "tank",
    device_name: "Ballon 1",
    device_type: null,
    attribute_name: "low_temperature",
    severity: "info",
    label: null,
    started_at: "2026-10-12T13:15:00Z",
    ended_at: "2026-10-12T13:23:00Z",
  }),
];

function makeAsset(id: string, name: string): Asset {
  return { id, parent_id: null, type: "zone", name, path: [id], position: 0 };
}

function returnEpisodes(episodes: FaultEpisode[], truncated = false) {
  mockUseFaultEpisodes.mockReturnValue({
    episodes,
    period: PERIOD,
    asOf: NOW.getTime(),
    truncated,
    loading: false,
    error: null,
  });
}

let location = "";
function LocationProbe() {
  const current = useLocation();
  location = `${current.pathname}${current.search}`;
  return null;
}

function renderPage(path = "/faults/history") {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/faults/history" element={<FaultHistoryPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

/** The table's rows, header row dropped: day headings and episodes alike. */
function bodyRows() {
  return screen.getAllByRole("row").slice(1);
}

/** The row of the episode that opened at `time`, local. */
function episodeRow(time: string): HTMLElement {
  const row = bodyRows().find((r) =>
    within(r).queryByText(new RegExp(`^${time} →`)),
  );
  if (!row) throw new Error(`no episode opened at ${time}`);
  return row;
}

function figure(label: string): HTMLElement {
  const tile = screen.getByText(label).closest("[data-slot='history-figure']");
  if (!tile) throw new Error(`no figure ${label}`);
  return tile as HTMLElement;
}

inTimeZone("America/Martinique");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  returnEpisodes(EPISODES);
  mockUseFaultsList.mockReturnValue({
    faults: [{}, {}],
    loading: false,
    error: null,
  });
  mockUseAssetTree.mockReturnValue({
    assetByDeviceId: { "room-203": makeAsset("a203", "R+2 · Chambre 203") },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mockUseFaultEpisodes.mockReset();
  mockUseFaultsList.mockReset();
  mockUseAssetTree.mockReset();
  mockDownloadCsv.mockReset();
});

describe("FaultHistoryPage", () => {
  it("sits on the history tab, the ongoing one still counting the alerts", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /Ongoing/ })).toHaveTextContent("2");
  });

  it("reads the last 7 days unless another period is picked", async () => {
    renderPage();
    expect(mockUseFaultEpisodes).toHaveBeenLastCalledWith({ last: "7d" });
    await userEvent.click(screen.getByRole("button", { name: "24 h" }));
    expect(mockUseFaultEpisodes).toHaveBeenLastCalledWith({ last: "1d" });
  });

  it("lists the alerts by local day, newest first", () => {
    renderPage();
    const headings = bodyRows()
      .filter((row) => within(row).queryAllByRole("cell").length === 1)
      .map((row) => row.textContent);
    expect(headings).toEqual([
      "Aujourd'hui · 3 alerts",
      "Hier · 1 alerts",
      "Lundi 12 octobre · 1 alerts",
    ]);
  });

  it("says when each episode ran and for how long", () => {
    renderPage();
    const closed = episodeRow("07:12");
    expect(within(closed).getByText("07:12 → 07:58")).toBeInTheDocument();
    expect(within(closed).getByText("46 min")).toBeInTheDocument();
    const ongoing = episodeRow("13:30");
    expect(within(ongoing).getByText("13:30 → en cours")).toBeInTheDocument();
    expect(within(ongoing).getByText("depuis 1 h 10")).toBeInTheDocument();
  });

  it("names each alert, its device and zone, and how often it came back", () => {
    renderPage();
    const row = episodeRow("07:12");
    expect(within(row).getByText("Fenêtre ouverte")).toBeInTheDocument();
    expect(within(row).getByText("3 times over 7 days")).toBeInTheDocument();
    expect(within(row).getByText("Thermostat")).toBeInTheDocument();
    expect(within(row).getByText("R+2 · Chambre 203")).toBeInTheDocument();
    // A fault code reads with its value; seen once, it did not come back.
    const pump = episodeRow("08:12");
    expect(within(pump).getByText("Fault Code: 3")).toBeInTheDocument();
    expect(within(pump).queryByText(/times over/)).not.toBeInTheDocument();
  });

  it("links each episode to its device's history, half an hour either side", () => {
    renderPage();
    const link = within(episodeRow("07:12")).getByRole("link", {
      name: "History of the device",
    });
    const url = new URL(link.getAttribute("href")!, "http://gridone.test");
    expect(url.pathname).toBe("/devices/room-203/history/chart");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      attrs: "window_open",
      start: "2026-10-14T10:42:00.000Z",
      end: "2026-10-14T12:28:00.000Z",
    });
    // Still open: the chart runs up to now.
    const ongoing = within(episodeRow("13:30")).getByRole("link", {
      name: "History of the device",
    });
    expect(ongoing.getAttribute("href")).not.toContain("end=");
  });

  it("heads the history with the period's figures", () => {
    renderPage();
    expect(figure("Alerts over 7 days")).toHaveTextContent("5");
    expect(figure("Alerts over 7 days")).toHaveTextContent("2 still ongoing");
    // 70 + 388 + 46 + 23 + 8 minutes in alert.
    expect(figure("Time in alert")).toHaveTextContent("8 h 55");
    expect(figure("Most frequent")).toHaveTextContent("Fenêtre ouverte");
    expect(figure("Most frequent")).toHaveTextContent("Chambre 203 · 3 times");
  });

  it("filters by severity, the figures with it", async () => {
    renderPage();
    const severities = screen.getByRole("group", { name: "Severity" });
    await userEvent.click(
      within(severities).getByRole("button", { name: /Critique/ }),
    );
    expect(location).toBe("/faults/history?severity=alert");
    expect(episodeRow("08:12")).toBeInTheDocument();
    expect(screen.queryByText("Fenêtre ouverte")).not.toBeInTheDocument();
    expect(figure("Alerts over 7 days")).toHaveTextContent("1");
  });

  it("searches the device, the zone and the alert", () => {
    renderPage("/faults/history?search=ballon");
    expect(screen.getByText("Ballon 1")).toBeInTheDocument();
    expect(screen.queryByText("Chambre 203")).not.toBeInTheDocument();
    cleanup();
    renderPage("/faults/history?search=R%2B2");
    expect(screen.getAllByText("Chambre 203")).toHaveLength(3);
    expect(screen.queryByText("Ballon 1")).not.toBeInTheDocument();
  });

  it("reads by device on request, the longest in alert first", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "By device" }));
    expect(location).toBe("/faults/history?view=device");
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Pompe à chaleur")).toBeInTheDocument();
    expect(within(rows[0]).getByText("6 h 28")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Chambre 203")).toBeInTheDocument();
    expect(within(rows[1]).getByText("2 h 19")).toBeInTheDocument();
    expect(within(rows[1]).getByText("3")).toBeInTheDocument();
    expect(within(rows[1]).getByText("ongoing right now")).toBeInTheDocument();
    expect(
      within(rows[1]).getByText("aujourd'hui · 13:30"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 different alerts over 7 days"),
    ).toBeInTheDocument();
  });

  it("exports the reading on screen", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    const [header, body, filename] = mockDownloadCsv.mock.calls[0];
    expect(header).toEqual([
      "Severity",
      "Alert",
      "Device",
      "Zone",
      "Start",
      "End",
      "Duration (min)",
    ]);
    expect(body).toHaveLength(5);
    expect(body[2]).toEqual([
      "avertissement",
      "Fenêtre ouverte",
      "Chambre 203",
      "R+2 · Chambre 203",
      "2026-10-14T11:12:00Z",
      "2026-10-14T11:58:00Z",
      "46",
    ]);
    expect(filename).toBe("alert-history-2026-10-07-2026-10-14.csv");

    await userEvent.click(screen.getByRole("button", { name: "By device" }));
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    const [byDevice, lines] = mockDownloadCsv.mock.calls[1];
    expect(byDevice.slice(4)).toEqual(["Last time", "Total (min)", "Times"]);
    expect(lines[1].slice(2)).toEqual([
      "Chambre 203",
      "R+2 · Chambre 203",
      "2026-10-14T17:30:00Z",
      "139",
      "3",
    ]);
  });

  it("warns when the history of a device was cut short", () => {
    returnEpisodes(EPISODES, true);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Some changes may be missing",
    );
  });

  it("says when the period had no alert", () => {
    returnEpisodes([]);
    renderPage();
    expect(screen.getByText("No alerts over this period")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Export" }),
    ).not.toBeInTheDocument();
    // The period stays at hand to look further back.
    expect(screen.getByRole("button", { name: "30 j" })).toBeInTheDocument();
  });

  it("clears the filters that leave nothing to show", async () => {
    renderPage("/faults/history?search=nothing");
    expect(
      screen.getByText("No alerts match these filters"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(location).toBe("/faults/history");
    expect(screen.getAllByText("Chambre 203")).toHaveLength(3);
  });

  it("shows skeletons while loading and the error fallback on failure", () => {
    mockUseFaultEpisodes.mockReturnValue({
      episodes: [],
      period: null,
      truncated: false,
      loading: true,
      error: null,
    });
    const { container } = renderPage();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    cleanup();
    mockUseFaultEpisodes.mockReturnValue({
      episodes: [],
      period: null,
      truncated: false,
      loading: false,
      error: "boom",
    });
    renderPage();
    expect(
      screen.getByText("Unable to load the alert history"),
    ).toBeInTheDocument();
  });
});

describe("incomplete history", () => {
  it("does not claim an empty period when no episode was verified", () => {
    returnEpisodes([], true);
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Some changes may be missing",
    );
    expect(
      screen.queryByText("No alerts over this period"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Time in alert")).not.toBeInTheDocument();
  });
  it("keeps verified rows but disables export and recurrence claims", async () => {
    returnEpisodes(EPISODES, true);
    renderPage();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("3 times over 7 days")).not.toBeInTheDocument();
    expect(screen.queryByText("Most frequent")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(mockDownloadCsv).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "By device" }));
    expect(screen.getAllByText("faults.history.unavailable")).toHaveLength(9);
  });
  it("never extends a stale snapshot to the browser clock", () => {
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000));
    renderPage();
    expect(
      within(episodeRow("13:30")).getByText("depuis 1 h 10"),
    ).toBeInTheDocument();
    expect(figure("Time in alert")).toHaveTextContent("8 h 55");
  });
  it("normalizes unsupported all-time links to seven days", () => {
    renderPage("/faults/history?last=all");
    expect(mockUseFaultEpisodes).toHaveBeenLastCalledWith({ last: "7d" });
    expect(location).toBe("/faults/history");
    expect(screen.getByRole("button", { name: "7 j" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

it("keeps incomplete messaging when filters hide verified rows", () => {
  returnEpisodes(EPISODES, true);
  renderPage("/faults/history?search=nothing");
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.getByText("No alerts match these filters")).toBeInTheDocument();
});
