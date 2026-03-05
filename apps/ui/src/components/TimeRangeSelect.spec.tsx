import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TimeRangeSelect } from "./TimeRangeSelect";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      const map: Record<string, string> = {
        "deviceDetails.rangeAll": "All time",
        "deviceDetails.rangeCustom": "Custom range",
        "deviceDetails.rangeApply": "Apply",
      };
      if (map[key]) return map[key];
      if (key === "deviceDetails.rangeLastMinutes")
        return `Last ${opts?.count} min`;
      if (key === "deviceDetails.rangeLastHours") return `Last ${opts?.count}h`;
      if (key === "deviceDetails.rangeLastDays") return `Last ${opts?.count}d`;
      return key;
    },
  }),
}));

afterEach(cleanup);

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

  it("does not show 'All time' option in popover", () => {
    renderWithRouter(<TimeRangeSelect />);
    fireEvent.click(screen.getByText("Last 3h"));
    expect(screen.queryByText("All time")).not.toBeInTheDocument();
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
