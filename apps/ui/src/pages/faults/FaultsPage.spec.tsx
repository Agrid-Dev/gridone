import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Asset, FaultView } from "@gridone/sdk";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "faults.title": "Active faults",
    "faults.caption": "Fleet triage",
    "faults.emptyTitle": "No active faults across your fleet.",
    "faults.emptyDescription": "All devices are healthy.",
    "faults.unableToLoad": "Unable to load faults",
    "faults.export": "Export",
    "faults.exportFilenameStem": "active-faults",
    "faults.summary.alert": "Alerts",
    "faults.summary.warning": "Warnings",
    "faults.summary.info": "Info",
    "faults.columns.device": "Device",
    "faults.columns.zone": "Zone",
    "faults.columns.fault": "Fault",
    "faults.columns.severity": "Severity",
    "faults.columns.activeSince": "Active since",
    "faults.columns.since": "Since",
    "common:common.fault": "fault",
    "common.severity.alert": "alert",
    "common.severity.warning": "warning",
    "common.severity.info": "info",
    "common.duration.lessThanAMinute": "less than a minute",
    "common.duration.minutes": "a few minutes",
    "common.duration.hours": "a few hours",
    "common.duration.days": "a few days",
  }),
);

const mockUseFaultsList = vi.fn();
vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => mockUseFaultsList(),
}));

const mockUseAssetTree = vi.fn();
vi.mock("@/hooks/useAssetTree", () => ({
  useAssetTree: () => mockUseAssetTree(),
}));

const mockDownloadCsv = vi.fn();
vi.mock("@/lib/csv", () => ({
  downloadCsv: (...args: unknown[]) => mockDownloadCsv(...args),
}));

import FaultsPage from "./FaultsPage";

function makeFault(overrides: Partial<FaultView> = {}): FaultView {
  return {
    device_id: "d1",
    device_name: "Alpha",
    attribute_name: "compressor_fault",
    data_type: "bool",
    severity: "alert",
    current_value: true,
    last_updated: "2026-04-24T00:00:00Z",
    last_changed: "2026-04-24T00:00:00Z",
    ...overrides,
  };
}

function makeAsset(id: string, name: string): Asset {
  return { id, parent_id: null, type: "zone", name, path: [id], position: 0 };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FaultsPage />
    </MemoryRouter>,
  );
}

/** Rows in render order, header row dropped. */
function bodyRows() {
  return screen.getAllByRole("row").slice(1);
}

/** The summary card for a severity. Selected on `data-slot` because the
 *  severity cells in the table carry `data-severity` too. */
function summaryCard(severity: string): HTMLElement {
  const card = document.querySelector(
    `[data-slot="severity-summary"][data-severity="${severity}"]`,
  );
  if (!card) throw new Error(`no summary card for severity ${severity}`);
  return card as HTMLElement;
}

beforeEach(() => {
  mockUseFaultsList.mockReturnValue({
    faults: [
      makeFault({
        device_id: "d2",
        device_name: "Bravo",
        attribute_name: "low_pressure",
        severity: "warning",
      }),
      makeFault({
        device_id: "d1",
        device_name: "Alpha",
        attribute_name: "compressor_fault",
        severity: "alert",
      }),
      makeFault({
        device_id: "d3",
        device_name: "Charlie",
        attribute_name: "filter_notice",
        severity: "info",
      }),
    ],
    loading: false,
    error: null,
  });
  mockUseAssetTree.mockReturnValue({
    assetTree: [],
    assetsList: [],
    assetsById: {},
    assetByDeviceId: { d1: makeAsset("a1", "Ground floor") },
    isLoading: false,
  });
});

afterEach(() => {
  cleanup();
  mockUseFaultsList.mockReset();
  mockUseAssetTree.mockReset();
  mockDownloadCsv.mockReset();
});

describe("FaultsPage", () => {
  it("renders a row per fault with device, fault label and severity", () => {
    renderPage();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Compressor Fault")).toBeInTheDocument();
    expect(screen.getByText("Low Pressure")).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(3);
  });

  it("links the device cell to /devices/:id", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "/devices/d1",
    );
  });

  it("orders rows worst-severity first", () => {
    renderPage();
    const rows = bodyRows();
    expect(within(rows[0]).getByText("Alpha")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Bravo")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Charlie")).toBeInTheDocument();
  });

  it("orders equal severities longest-active first", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [
        makeFault({
          device_id: "recent",
          device_name: "Recent",
          severity: "warning",
          last_changed: "2026-04-24T00:00:00Z",
        }),
        makeFault({
          device_id: "old",
          device_name: "Old",
          severity: "warning",
          last_changed: "2026-01-01T00:00:00Z",
        }),
      ],
      loading: false,
      error: null,
    });
    renderPage();
    const rows = bodyRows();
    expect(within(rows[0]).getByText("Old")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Recent")).toBeInTheDocument();
  });

  it("shows the device's zone, and a dash when it has none", () => {
    renderPage();
    const rows = bodyRows();
    expect(within(rows[0]).getByText("Ground floor")).toBeInTheDocument();
    // Bravo (d2) is attached to no asset.
    expect(within(rows[1]).getByText("—")).toBeInTheDocument();
  });

  it("renders one summary card per severity with its count", () => {
    renderPage();
    for (const severity of ["alert", "warning", "info"]) {
      expect(within(summaryCard(severity)).getByText("1")).toBeInTheDocument();
    }
  });

  it("counts several faults of the same severity", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [
        makeFault({ device_id: "a", severity: "warning" }),
        makeFault({ device_id: "b", severity: "warning" }),
      ],
      loading: false,
      error: null,
    });
    renderPage();
    expect(within(summaryCard("warning")).getByText("2")).toBeInTheDocument();
  });

  it("tags each severity cell with its data-severity attribute", () => {
    renderPage();
    const rows = bodyRows();
    expect(
      within(rows[0]).getByText("alert").closest("[data-severity]"),
    ).toHaveAttribute("data-severity", "alert");
    expect(
      within(rows[1]).getByText("warning").closest("[data-severity]"),
    ).toHaveAttribute("data-severity", "warning");
  });

  it("marks each row with a severity-coloured leading rail", () => {
    renderPage();
    const rows = bodyRows();

    expect(within(rows[0]).getAllByRole("cell")[0]).toHaveClass(
      "border-l-status-error",
    );
    expect(within(rows[1]).getAllByRole("cell")[0]).toHaveClass(
      "border-l-status-warning",
    );
    expect(within(rows[2]).getAllByRole("cell")[0]).toHaveClass(
      "border-l-muted-foreground",
    );
  });

  it("exports the visible rows as CSV", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(mockDownloadCsv).toHaveBeenCalledTimes(1);
    const [header, body, filename] = mockDownloadCsv.mock.calls[0];
    expect(header).toEqual([
      "Device",
      "Zone",
      "Fault",
      "Severity",
      "Active since",
      "Since",
    ]);
    expect(body).toHaveLength(3);
    expect(body[0].slice(0, 4)).toEqual([
      "Alpha",
      "Ground floor",
      "Compressor Fault",
      "alert",
    ]);
    // Device with no asset exports an empty zone rather than the dash glyph.
    expect(body[1][1]).toBe("");
    expect(filename).toMatch(/^active-faults-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("shows the empty state and no export button when there are no faults", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: false,
      error: null,
    });
    renderPage();
    expect(
      screen.getByText("No active faults across your fleet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Export" }),
    ).not.toBeInTheDocument();
  });

  it("shows loading skeletons when loading", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: true,
      error: null,
    });
    const { container } = renderPage();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the error fallback when the hook returns an error", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: false,
      error: "boom",
    });
    renderPage();
    expect(screen.getByText("Unable to load faults")).toBeInTheDocument();
  });
});
