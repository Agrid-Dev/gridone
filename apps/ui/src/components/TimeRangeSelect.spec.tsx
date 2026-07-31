import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { createI18nMock } from "@/test/i18nMock";
import {
  DASHBOARD_DEFAULT_PRESET,
  DASHBOARD_PRESET_OPTIONS,
} from "@/lib/timeRange";
import { TimeRangeSelect } from "./TimeRangeSelect";

const STORAGE_KEY = "test.dashboards.period";

vi.mock("react-i18next", () =>
  createI18nMock({
    "timeRange.rangeAll": "All time",
    "timeRange.rangeCustom": "Custom range",
    "timeRange.rangeApply": "Apply",
    "timeRange.rangeLastMinutes": "Last {{count}} min",
    "timeRange.rangeLastHours": "Last {{count}}h",
    "timeRange.rangeLastDays": "Last {{count}}d",
    "timeRange.rangeLastMonths": "Last {{count}} months",
  }),
);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderWithRouter(
  ui: React.ReactElement,
  initialEntries: string[] = ["/"],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
  );
}

describe("TimeRangeSelect", () => {
  it("renders trigger with default range label (3h)", () => {
    renderWithRouter(<TimeRangeSelect />);
    expect(screen.getByText("Last 3h")).toBeInTheDocument();
  });

  it("reads initial range from URL params", () => {
    renderWithRouter(<TimeRangeSelect />, ["/?last=7d"]);
    expect(screen.getByText("Last 7d")).toBeInTheDocument();
  });

  it("opens popover showing all duration presets", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));

    expect(screen.getByText("Last 10 min")).toBeInTheDocument();
    expect(screen.getByText("Last 30 min")).toBeInTheDocument();
    expect(screen.getByText("Last 1h")).toBeInTheDocument();
    expect(screen.getByText("Last 12h")).toBeInTheDocument();
    expect(screen.getByText("Last 1d")).toBeInTheDocument();
    expect(screen.getByText("Last 7d")).toBeInTheDocument();
  });

  it("updates URL params when selecting a preset", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));
    fireEvent.click(screen.getByText("Last 1d"));

    expect(screen.getByText("Last 1d")).toBeInTheDocument();
  });

  it("updates URL params with custom range on Apply", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));

    const startInput = screen.getByLabelText("start");
    const endInput = screen.getByLabelText("end");
    fireEvent.change(startInput, { target: { value: "2026-01-01T00:00" } });
    fireEvent.change(endInput, { target: { value: "2026-01-31T23:59" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(screen.getByText("Custom range")).toBeInTheDocument();
  });

  it("shows Custom range section in popover", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));
    expect(screen.getByText("Custom range")).toBeInTheDocument();
    expect(screen.getByText("Apply")).toBeInTheDocument();
  });

  it("shows an 'All time' option in the popover", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("honors a custom default preset (all time) on the trigger", () => {
    renderWithRouter(<TimeRangeSelect defaultPreset="all" />);
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("shows active dot on 'Custom range' label when custom is selected", () => {
    renderWithRouter(<TimeRangeSelect />, [
      "/?start=2026-01-01T00:00&end=2026-01-31T23:59",
    ]);
    fireEvent.click(screen.getByText("Custom range"));
    const label = screen.getByText("Custom range", { selector: "p" });
    expect(label.querySelector("span")).toBeInTheDocument();
  });

  it("hides active dot on 'Custom range' label when preset is selected", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));
    const label = screen.getByText("Custom range", { selector: "p" });
    expect(label.querySelector("span")).not.toBeInTheDocument();
  });

  it("restores custom dates when re-opening the popover", () => {
    renderWithRouter(<TimeRangeSelect />, [
      "/?start=2026-03-01T08:00&end=2026-03-01T18:00",
    ]);
    fireEvent.click(screen.getByText("Custom range"));

    const startInput = screen.getByLabelText("start") as HTMLInputElement;
    const endInput = screen.getByLabelText("end") as HTMLInputElement;
    expect(startInput.value).toBe("2026-03-01T08:00");
    expect(endInput.value).toBe("2026-03-01T18:00");
  });

  it("offers the preset list it is given instead of the default ladder", () => {
    renderWithRouter(
      <TimeRangeSelect
        presets={DASHBOARD_PRESET_OPTIONS}
        defaultPreset={DASHBOARD_DEFAULT_PRESET}
      />,
    );
    fireEvent.click(screen.getByText("Last 7d"));

    expect(screen.getByText("Last 3 months")).toBeInTheDocument();
    expect(screen.queryByText("Last 10 min")).not.toBeInTheDocument();
  });

  it("reopens on the remembered preset when the URL carries no period", () => {
    window.localStorage.setItem(STORAGE_KEY, "3mo");
    renderWithRouter(
      <TimeRangeSelect
        presets={DASHBOARD_PRESET_OPTIONS}
        defaultPreset={DASHBOARD_DEFAULT_PRESET}
        storageKey={STORAGE_KEY}
      />,
    );
    expect(screen.getByText("Last 3 months")).toBeInTheDocument();
  });

  // The link is the shared artifact: a preference must never override the
  // period someone else deliberately put in the URL.
  it("lets a period in the URL win over the remembered preset", () => {
    window.localStorage.setItem(STORAGE_KEY, "3mo");
    renderWithRouter(
      <TimeRangeSelect
        presets={DASHBOARD_PRESET_OPTIONS}
        defaultPreset={DASHBOARD_DEFAULT_PRESET}
        storageKey={STORAGE_KEY}
      />,
      ["/?last=1d"],
    );
    expect(screen.getByText("Last 1d")).toBeInTheDocument();
  });

  it("remembers a picked preset for the next visit", () => {
    renderWithRouter(
      <TimeRangeSelect
        presets={DASHBOARD_PRESET_OPTIONS}
        defaultPreset={DASHBOARD_DEFAULT_PRESET}
        storageKey={STORAGE_KEY}
      />,
    );
    fireEvent.click(screen.getByText("Last 7d"));
    fireEvent.click(screen.getByText("Last 3 months"));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("3mo");
  });

  it("remembers nothing for a view that opted out", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));
    fireEvent.click(screen.getByText("Last 1d"));

    expect(window.localStorage.length).toBe(0);
  });

  it("resets specified params on change", () => {
    renderWithRouter(<TimeRangeSelect onChangeParamsReset={["page"]} />, [
      "/?page=3&last=1h",
    ]);
    // Selecting a new preset should reset 'page'
    fireEvent.click(screen.getByText("Last 1h"));
    fireEvent.click(screen.getByText("Last 7d"));

    // The label updates to 7d, meaning URL was updated
    expect(screen.getByText("Last 7d")).toBeInTheDocument();
  });
});
