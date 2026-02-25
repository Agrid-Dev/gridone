import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TimeRangeSelect } from "./TimeRangeSelect";
import type { TimeRange } from "./timeRange";

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

describe("TimeRangeSelect", () => {
  it("renders trigger with current range label", () => {
    render(
      <TimeRangeSelect
        value={{ kind: "preset", preset: "3h" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Last 3h")).toBeInTheDocument();
  });

  it("renders 'All time' label for all preset", () => {
    render(
      <TimeRangeSelect
        value={{ kind: "preset", preset: "all" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("All time")).toBeInTheDocument();
  });

  it("opens popover showing all presets", () => {
    render(
      <TimeRangeSelect
        value={{ kind: "preset", preset: "3h" }}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Last 3h"));

    expect(screen.getByText("Last 10 min")).toBeInTheDocument();
    expect(screen.getByText("Last 30 min")).toBeInTheDocument();
    expect(screen.getByText("Last 1h")).toBeInTheDocument();
    expect(screen.getByText("Last 12h")).toBeInTheDocument();
    expect(screen.getByText("Last 1d")).toBeInTheDocument();
    expect(screen.getByText("Last 7d")).toBeInTheDocument();
    // "All time" appears both in popover and trigger
    expect(screen.getAllByText("All time").length).toBeGreaterThanOrEqual(1);
  });

  it("calls onChange with correct preset when clicking a preset", () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelect
        value={{ kind: "preset", preset: "3h" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Last 3h"));
    fireEvent.click(screen.getByText("Last 1d"));

    expect(onChange).toHaveBeenCalledWith({
      kind: "preset",
      preset: "1d",
    });
  });

  it("calls onChange with custom range on Apply", () => {
    const onChange = vi.fn();
    render(
      <TimeRangeSelect
        value={{ kind: "preset", preset: "3h" }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Last 3h"));

    const startInput = screen.getByLabelText("start");
    const endInput = screen.getByLabelText("end");
    fireEvent.change(startInput, { target: { value: "2026-01-01T00:00" } });
    fireEvent.change(endInput, { target: { value: "2026-01-31T23:59" } });
    fireEvent.click(screen.getByText("Apply"));

    expect(onChange).toHaveBeenCalledWith<[TimeRange]>({
      kind: "custom",
      start: "2026-01-01T00:00",
      end: "2026-01-31T23:59",
    });
  });

  it("shows Custom range section in popover", () => {
    render(
      <TimeRangeSelect
        value={{ kind: "preset", preset: "3h" }}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Last 3h"));
    expect(screen.getByText("Custom range")).toBeInTheDocument();
    expect(screen.getByText("Apply")).toBeInTheDocument();
  });
});
