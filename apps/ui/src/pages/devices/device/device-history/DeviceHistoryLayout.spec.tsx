import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import { DeviceKind, type Device } from "@/api/devices";
import type { TimeSeries } from "@/api/timeseries";
import { TooltipProvider } from "@/components/ui/tooltip";

const { mockListSeries, mockGetSeriesPoints } = vi.hoisted(() => ({
  mockListSeries: vi.fn(),
  mockGetSeriesPoints: vi.fn(),
}));

vi.mock("@/api/timeseries", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/timeseries")>(
      "@/api/timeseries",
    );
  return {
    ...actual,
    listSeries: (...args: unknown[]) => mockListSeries(...args),
    getSeriesPoints: (...args: unknown[]) => mockGetSeriesPoints(...args),
    exportCsv: vi.fn(),
    exportPng: vi.fn(),
  };
});

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
    kind: DeviceKind.Physical,
    name: "AHU-1",
    type: null,
    tags: {},
    driverId: "drv",
    transportId: "tr",
    config: {},
    attributes: Object.fromEntries(
      names.map((name) => [
        name,
        {
          kind: "standard",
          name,
          dataType: "float",
          readWriteModes: ["read"],
          currentValue: null,
          lastUpdated: null,
          lastChanged: null,
        },
      ]),
    ),
    isFaulty: false,
  } satisfies Device;

  const series: TimeSeries[] = names.map((metric) => ({
    id: `s-${metric}`,
    dataType: "float",
    ownerId: "d1",
    metric,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }));
  mockListSeries.mockResolvedValue(series);
}

function renderLayout() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/devices/d1/history/table"]}>
          <Routes>
            <Route
              path="/devices/:deviceId/history"
              element={<DeviceHistoryLayout />}
            >
              <Route path="table" element={<div />} />
            </Route>
          </Routes>
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
});

afterEach(() => {
  cleanup();
  mockListSeries.mockReset();
  mockGetSeriesPoints.mockReset();
});

describe("DeviceHistoryLayout attribute selection", () => {
  it("fetches points only for the default-visible attributes", async () => {
    setupDevice(8);
    renderLayout();

    await screen.findByText("5 / 8");

    expect(mockGetSeriesPoints).toHaveBeenCalledTimes(5);
    const fetchedMetrics = mockGetSeriesPoints.mock.calls.map((c) => c[1]);
    expect(fetchedMetrics).toEqual([0, 1, 2, 3, 4].map(attrName));
  });

  it("fetches only the missing series when the selection grows", async () => {
    setupDevice(8);
    renderLayout();
    await screen.findByText("5 / 8");
    mockGetSeriesPoints.mockClear();

    const user = userEvent.setup();
    await user.click(screen.getByText("Attr 06"));

    await screen.findByText("6 / 8");
    await waitFor(() => expect(mockGetSeriesPoints).toHaveBeenCalledTimes(1));
    expect(mockGetSeriesPoints.mock.calls[0][1]).toBe(attrName(5));
  });

  it("disables select-all when the device has too many attributes", async () => {
    setupDevice(25);
    renderLayout();
    await screen.findByText("5 / 25");

    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    expect(screen.getByText("Too many attributes")).toBeInTheDocument();
  });

  it("keeps select-all enabled at or below the threshold", async () => {
    setupDevice(8);
    renderLayout();
    await screen.findByText("5 / 8");

    expect(screen.getByRole("button", { name: "Select all" })).toBeEnabled();
  });

  it("filters the attribute list with the search input", async () => {
    setupDevice(8);
    renderLayout();
    await screen.findByText("5 / 8");

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search attributes…"), "06");

    expect(screen.getByText("Attr 06")).toBeInTheDocument();
    expect(screen.queryByText("Attr 01")).not.toBeInTheDocument();
  });
});
