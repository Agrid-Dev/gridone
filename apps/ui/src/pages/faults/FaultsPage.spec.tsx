import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { FaultView } from "@/api/faults";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "faults.title": "Active faults",
        "faults.subtitle": "Fleet triage",
        "faults.searchPlaceholder": "Search by device or fault",
        "faults.emptyTitle": "No active faults across your fleet.",
        "faults.emptyDescription": "All devices are healthy.",
        "faults.noMatchTitle": "No matching faults",
        "faults.noMatchDescription": "Try a different search term.",
        "faults.unableToLoad": "Unable to load faults",
        "faults.columns.device": "Device",
        "faults.columns.fault": "Fault",
        "faults.columns.severity": "Severity",
        "faults.columns.activeSince": "Active since",
        "common.severity.alert": "alert",
        "common.severity.warning": "warning",
        "common.severity.info": "info",
        "common.timeAgo.justNow": "just now",
        "common.timeAgo.minutes": "a few minutes ago",
        "common.timeAgo.hours": "a few hours ago",
        "common.timeAgo.days": "a few days ago",
      };
      return map[key] ?? key;
    },
  }),
}));

const mockUseFaultsList = vi.fn();
vi.mock("@/hooks/useFaultsList", () => ({
  useFaultsList: () => mockUseFaultsList(),
}));

import FaultsPage from "./FaultsPage";

function makeFault(overrides: Partial<FaultView> = {}): FaultView {
  return {
    deviceId: "d1",
    deviceName: "Alpha",
    attributeName: "compressor_fault",
    severity: "alert",
    currentValue: true,
    lastUpdated: "2026-04-24T00:00:00Z",
    lastChanged: "2026-04-24T00:00:00Z",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FaultsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseFaultsList.mockReturnValue({
    faults: [
      makeFault({
        deviceId: "d1",
        deviceName: "Alpha",
        attributeName: "compressor_fault",
      }),
      makeFault({
        deviceId: "d2",
        deviceName: "Bravo",
        attributeName: "low_pressure",
        severity: "warning",
      }),
    ],
    loading: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  mockUseFaultsList.mockReset();
});

describe("FaultsPage", () => {
  it("renders a row per fault with device name, label, severity, and active since", () => {
    renderPage();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Compressor Fault")).toBeInTheDocument();
    expect(screen.getByText("Low Pressure")).toBeInTheDocument();
    expect(screen.getByText("alert")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("links device cell to /devices/:id", () => {
    renderPage();
    const link = screen.getByRole("link", { name: "Alpha" });
    expect(link).toHaveAttribute("href", "/devices/d1");
  });

  it("shows empty state when there are no faults", () => {
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
  });

  it("shows loading skeleton when loading", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: true,
      error: null,
    });
    const { container } = renderPage();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows error fallback when the hook returns an error", () => {
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: false,
      error: "boom",
    });
    renderPage();
    expect(screen.getByText("Unable to load faults")).toBeInTheDocument();
  });

  it("filters rows by device name (case-insensitive)", async () => {
    renderPage();
    const input = screen.getByRole("searchbox");
    await userEvent.type(input, "brav");
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("filters rows by attribute name (case-insensitive)", async () => {
    renderPage();
    const input = screen.getByRole("searchbox");
    await userEvent.type(input, "COMPRESSOR");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
  });

  it("shows the no-match empty state when the query matches nothing", async () => {
    renderPage();
    const input = screen.getByRole("searchbox");
    await userEvent.type(input, "zzzz");
    expect(screen.getByText("No matching faults")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("matches as a fuzzy subsequence, allowing gaps", async () => {
    renderPage();
    const input = screen.getByRole("searchbox");
    // "cmpr" is a subsequence of "compressor_fault" but not a substring
    await userEvent.type(input, "cmpr");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
  });

  it("keeps the main empty state when there are no faults and a query is typed", async () => {
    mockUseFaultsList.mockReturnValue({
      faults: [],
      loading: false,
      error: null,
    });
    renderPage();
    const input = screen.getByRole("searchbox");
    await userEvent.type(input, "anything");
    expect(
      screen.getByText("No active faults across your fleet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No matching faults")).not.toBeInTheDocument();
  });

  it("renders each severity chip with the correct data-severity attribute", () => {
    renderPage();
    const rows = screen.getAllByRole("row").slice(1);
    expect(
      within(rows[0]).getByText("alert").closest("[data-severity]"),
    ).toHaveAttribute("data-severity", "alert");
    expect(
      within(rows[1]).getByText("warning").closest("[data-severity]"),
    ).toHaveAttribute("data-severity", "warning");
  });
});
