import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mock react-spring before any visx imports — prevents jsdom crashes
vi.mock("@react-spring/web", () => import("@/test/react-spring-mock"));

import { TimeSeriesChartInner } from "../TimeSeriesChartInner";
import {
  timestamps,
  floatSeries,
  floatValues,
  booleanSeries,
  booleanValues,
  stringSeries,
  stringValues,
  manyStringTimestamps,
  manyStringSeries,
  manyStringValues,
} from "./fixture";

afterEach(cleanup);

const WIDTH = 800;

/** Selector for top-level XYChart SVGs (excludes nested axis SVGs). */
const XYCHART_SVG = 'svg[aria-label="XYChart"]';

/** Render the chart with all three series types. */
function renderFull() {
  return render(
    <TimeSeriesChartInner
      timestamps={timestamps}
      lineSeries={floatSeries}
      lineValues={floatValues}
      booleanSeries={booleanSeries}
      booleanValues={booleanValues}
      stringSeries={stringSeries}
      stringValues={stringValues}
      width={WIDTH}
    />,
  );
}

// ---------------------------------------------------------------------------
// Legends
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — legends", () => {
  it("renders float series legends", () => {
    renderFull();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("Humidity")).toBeInTheDocument();
  });

  it("renders boolean series legend", () => {
    renderFull();
    expect(screen.getByText("Heater On")).toBeInTheDocument();
  });

  it("renders string series legends with values", () => {
    renderFull();
    // String legends show "label: value"
    expect(screen.getByText(/Mode: idle/)).toBeInTheDocument();
    expect(screen.getByText(/Mode: heating/)).toBeInTheDocument();
    expect(screen.getByText(/Mode: cooling/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SVG series rendering
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — series rendering", () => {
  it("renders one SVG path per float series", () => {
    const { container } = renderFull();
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders an SVG for each boolean series", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        booleanSeries={booleanSeries}
        booleanValues={booleanValues}
        width={WIDTH}
      />,
    );
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBe(booleanSeries.length);
  });

  it("renders an SVG for each string series", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        stringSeries={stringSeries}
        stringValues={stringValues}
        width={WIDTH}
      />,
    );
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBe(stringSeries.length);
  });

  it("renders all panel types together", () => {
    const { container } = renderFull();
    // 1 float SVG + 1 boolean SVG + 1 string SVG = 3
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Empty / partial states
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — empty states", () => {
  it("returns null when width is 0", () => {
    const { container } = render(
      <TimeSeriesChartInner timestamps={timestamps} width={0} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders only float panel when no bool/string data", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        width={WIDTH}
      />,
    );
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBe(1);
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.queryByText("Heater On")).not.toBeInTheDocument();
  });

  it("renders only boolean panels when no float/string data", () => {
    render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        booleanSeries={booleanSeries}
        booleanValues={booleanValues}
        width={WIDTH}
      />,
    );
    expect(screen.getByText("Heater On")).toBeInTheDocument();
    expect(screen.queryByText("Temperature")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Crosshair
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — crosshair", () => {
  it("shows a vertical crosshair line on pointer move", () => {
    const { container } = renderFull();
    const wrapper = container.firstElementChild!;

    fireEvent.pointerMove(wrapper, {
      clientX: 400,
      clientY: 200,
    });

    // Crosshair is an absolutely-positioned div with width:1
    const absoluteDivs = Array.from(
      container.querySelectorAll<HTMLDivElement>("div"),
    ).filter(
      (div) =>
        div.style.position === "absolute" &&
        (div.style.width === "1px" || div.style.width === "1"),
    );
    expect(absoluteDivs.length).toBeGreaterThan(0);
  });

  it("hides the crosshair on pointer leave", () => {
    const { container } = renderFull();
    const wrapper = container.firstElementChild!;

    fireEvent.pointerMove(wrapper, { clientX: 400, clientY: 200 });
    fireEvent.pointerLeave(wrapper);

    const absoluteDivs = Array.from(
      container.querySelectorAll<HTMLDivElement>("div"),
    ).filter(
      (div) =>
        div.style.position === "absolute" &&
        (div.style.width === "1px" || div.style.width === "1"),
    );
    expect(absoluteDivs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — tooltip", () => {
  function hoverChart() {
    const result = renderFull();
    const wrapper = result.container.firstElementChild!;

    // getBoundingClientRect is not available in jsdom — mock it
    wrapper.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: WIDTH,
      bottom: 600,
      width: WIDTH,
      height: 600,
      x: 0,
      y: 0,
      toJSON() {},
    });

    // Hover over the middle of the chart area
    fireEvent.pointerMove(wrapper, { clientX: 400, clientY: 200 });
    return result;
  }

  it("shows a tooltip on hover", () => {
    hoverChart();
    const tooltip = document.querySelector(".bg-popover");
    expect(tooltip).toBeInTheDocument();
  });

  it("displays a timestamp in the tooltip", () => {
    hoverChart();
    const tooltip = document.querySelector(".bg-popover");
    expect(tooltip).not.toBeNull();
    // The timestamp should be a formatted date string
    expect(tooltip!.textContent).toMatch(/2025/);
  });

  it("displays float values with 2-digit precision", () => {
    hoverChart();
    const tooltip = document.querySelector(".bg-popover");
    // Float values are formatted with toFixed(2)
    const text = tooltip!.textContent!;
    expect(text).toMatch(/\d+\.\d{2}/);
  });

  it("displays boolean labels in the tooltip", () => {
    hoverChart();
    const tooltip = document.querySelector(".bg-popover");
    const text = tooltip!.textContent!;
    expect(text).toContain("Heater On");
    expect(text).toMatch(/true|false/);
  });

  it("displays string labels in the tooltip", () => {
    hoverChart();
    const tooltip = document.querySelector(".bg-popover");
    const text = tooltip!.textContent!;
    expect(text).toContain("Mode");
  });

  it("shows all series in a single tooltip", () => {
    hoverChart();
    const tooltip = document.querySelector(".bg-popover");
    const text = tooltip!.textContent!;
    // All series labels should be present in one tooltip
    expect(text).toContain("Temperature");
    expect(text).toContain("Humidity");
    expect(text).toContain("Heater On");
    expect(text).toContain("Mode");
  });

  it("hides the tooltip on pointer leave", () => {
    const { container } = hoverChart();
    const wrapper = container.firstElementChild!;
    fireEvent.pointerLeave(wrapper);

    const tooltip = container.querySelector(".bg-popover");
    expect(tooltip).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bottom axis placement
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — bottom axis", () => {
  it("renders bottom axis only on the last panel", () => {
    const { container } = renderFull();
    const svgs = container.querySelectorAll(XYCHART_SVG);
    let bottomAxisCount = 0;
    svgs.forEach((svg) => {
      const axisGroups = svg.querySelectorAll(
        'g[class*="visx-axis-bottom"], g.visx-axis-bottom',
      );
      bottomAxisCount += axisGroups.length;
    });
    // At most 1 bottom axis (only on last panel)
    expect(bottomAxisCount).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Panel heights
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — panel heights", () => {
  it("respects custom lineHeight", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        width={WIDTH}
        lineHeight={500}
      />,
    );
    const svg = container.querySelector(XYCHART_SVG);
    expect(svg).not.toBeNull();
    // SVG height should include the custom lineHeight + AXIS_EXTRA (28)
    // since float is the only panel and thus the last
    const height = Number(svg!.getAttribute("height"));
    expect(height).toBe(500 + 28);
  });

  it("respects custom categoricalHeight", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        booleanSeries={booleanSeries}
        booleanValues={booleanValues}
        width={WIDTH}
        categoricalHeight={80}
      />,
    );
    const svg = container.querySelector(XYCHART_SVG);
    expect(svg).not.toBeNull();
    // Boolean is the only (and last) panel: height + AXIS_EXTRA
    const height = Number(svg!.getAttribute("height"));
    expect(height).toBe(80 + 28);
  });
});

// ---------------------------------------------------------------------------
// Legend swatches
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — legend swatches", () => {
  it("renders line swatches for float series", () => {
    const { container } = renderFull();
    // Float legend swatches are 16px wide, 3px tall (line variant)
    const lineSwatches = Array.from(
      container.querySelectorAll<HTMLSpanElement>("span"),
    ).filter(
      (span) => span.style.width === "16px" && span.style.height === "3px",
    );
    expect(lineSwatches.length).toBe(floatSeries.length);
  });

  it("renders area swatches for boolean series", () => {
    const { container } = renderFull();
    // Boolean legend swatches are 10px × 10px (area variant), one per boolean series
    const areaSwatches = Array.from(
      container.querySelectorAll<HTMLSpanElement>("span"),
    ).filter(
      (span) => span.style.width === "10px" && span.style.height === "10px",
    );
    // Boolean (1) + string unique values (3: idle, heating, cooling) = 4
    expect(areaSwatches.length).toBe(
      booleanSeries.length + 3, // 3 unique string values
    );
  });
});

// ---------------------------------------------------------------------------
// StringPanel — many unique values (performance cap)
// ---------------------------------------------------------------------------

describe("StringPanel — many unique values", () => {
  it("renders without crashing and caps series to ≤ 11", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={manyStringTimestamps}
        stringSeries={manyStringSeries}
        stringValues={manyStringValues}
        width={WIDTH}
      />,
    );
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBe(1);
    // At most 10 top values + 1 "Other" = 11 area swatches
    const areaSwatches = Array.from(
      container.querySelectorAll<HTMLSpanElement>("span"),
    ).filter(
      (span) => span.style.width === "10px" && span.style.height === "10px",
    );
    expect(areaSwatches.length).toBeLessThanOrEqual(11);
  });

  it('shows "Other" in legend', () => {
    render(
      <TimeSeriesChartInner
        timestamps={manyStringTimestamps}
        stringSeries={manyStringSeries}
        stringValues={manyStringValues}
        width={WIDTH}
      />,
    );
    expect(screen.getByText(/Status: Other/)).toBeInTheDocument();
  });

  it("still renders few values normally without Other", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        stringSeries={stringSeries}
        stringValues={stringValues}
        width={WIDTH}
      />,
    );
    // 3 unique values (idle, heating, cooling) → 3 swatches, no "Other"
    const areaSwatches = Array.from(
      container.querySelectorAll<HTMLSpanElement>("span"),
    ).filter(
      (span) => span.style.width === "10px" && span.style.height === "10px",
    );
    expect(areaSwatches.length).toBe(3);
    expect(screen.queryByText(/Other/)).not.toBeInTheDocument();
  });
});
