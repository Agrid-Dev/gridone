import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Mock react-spring before any visx imports — prevents jsdom crashes
vi.mock("@react-spring/web", () => import("@/test/react-spring-mock"));

import { TimeSeriesChartInner } from "../TimeSeriesChartInner";
import {
  timestamps,
  floatSeries,
  floatValues,
  intSeries,
  intValues,
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

/** Legend swatch (first span) sitting next to the legend label with `text`. */
function swatchFor(text: string): HTMLSpanElement {
  const label = screen.getByText(text);
  const swatch = label.parentElement?.querySelector("span");
  if (!swatch) throw new Error(`no swatch for "${text}"`);
  return swatch as HTMLSpanElement;
}

// ---------------------------------------------------------------------------
// Semantic string panel colours (AGR-854)
// ---------------------------------------------------------------------------

describe("StringPanel — semantic colours", () => {
  it("colours a connection_status panel with the shared status palette", () => {
    render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        stringSeries={[{ key: "connection_status", label: "Connection" }]}
        stringValues={{
          connection_status: [
            "ok",
            "ok",
            "degraded",
            "error",
            "idle",
            "ok",
            "degraded",
            "error",
            "idle",
            "ok",
          ],
        }}
        width={WIDTH}
      />,
    );
    expect(swatchFor("ok").style.backgroundColor).toBe("hsl(var(--status-ok))");
    expect(swatchFor("degraded").style.backgroundColor).toBe(
      "hsl(var(--status-warning))",
    );
    expect(swatchFor("error").style.backgroundColor).toBe(
      "hsl(var(--status-error))",
    );
    expect(swatchFor("idle").style.backgroundColor).toBe(
      "hsl(var(--status-info))",
    );
  });

  it("colours a thermostat mode panel by HVAC meaning", () => {
    render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        stringSeries={[{ key: "mode", label: "Mode" }]}
        stringValues={{
          mode: [
            "heat",
            "heat",
            "cool",
            "cool",
            "fan",
            "auto",
            "heat",
            "cool",
            "fan",
            "auto",
          ],
        }}
        width={WIDTH}
      />,
    );
    expect(swatchFor("heat").style.backgroundColor).toBe(
      "hsl(var(--hvac-heat))",
    );
    expect(swatchFor("cool").style.backgroundColor).toBe(
      "hsl(var(--hvac-cool))",
    );
  });
});

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

  // The series is named once and its values follow, rather than every swatch
  // restating it.
  it("names a string series once, then lists its values", () => {
    renderFull();
    expect(screen.getByText("Mode")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
    expect(screen.getByText("heating")).toBeInTheDocument();
    expect(screen.getByText("cooling")).toBeInTheDocument();
    expect(screen.queryByText(/Mode: /)).not.toBeInTheDocument();
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

  // Bars are the mark for aggregated series, where a point stands for the
  // bucket it reports rather than an instant.
  it("draws a rect per bucket per series when the mark is bars", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        numericMark="bar"
        width={WIDTH}
      />,
    );

    // One panel, and a bar for every bucket that carries a value — the two
    // fixture series have one empty bucket each, which draws nothing.
    expect(container.querySelectorAll(XYCHART_SVG).length).toBe(1);
    const bars = container.querySelectorAll("rect.visx-bar");
    expect(bars.length).toBe(timestamps.length * floatSeries.length - 2);
  });

  // A bar's height is its value, so the axis has to start at zero — the
  // opposite of what the line panel wants (AGR-883), and the reason bars are
  // their own panel rather than a style on that one.
  it("anchors the bar y-axis at zero", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        numericMark="bar"
        width={WIDTH}
      />,
    );

    const tickValues = [...container.querySelectorAll("text")]
      .map((el) => Number(el.textContent))
      .filter((v) => !Number.isNaN(v));
    expect(Math.min(...tickValues)).toBe(0);
  });

  // Side by side within the bucket, not stacked and not overlapping: each
  // series takes its own slot, so two series make bars half a slot wide and
  // the second sits to the right of the first.
  it("sets the series of a bucket beside one another", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        numericMark="bar"
        width={WIDTH}
      />,
    );

    const bars = [
      ...container.querySelectorAll<SVGRectElement>("rect.visx-bar"),
    ];
    const xs = bars.map((b) => Number(b.getAttribute("x")));
    const widths = bars.map((b) => Number(b.getAttribute("width")));
    // No two bars occupy the same space.
    const spans = xs
      .map((x, i) => [x, x + widths[i]] as const)
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1] - 0.001);
    }
  });

  it("scales the float y-axis to the data extent, not down to 0 (AGR-883)", () => {
    // All fixture values sit in [20.1, 48.5]; with visx's default
    // `zero: true` the axis would start at 0.
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        width={WIDTH}
      />,
    );
    const tickValues = [...container.querySelectorAll("text")]
      .map((el) => Number(el.textContent))
      .filter((v) => !Number.isNaN(v));
    expect(tickValues.length).toBeGreaterThan(0);
    expect(Math.min(...tickValues)).toBeGreaterThanOrEqual(20);
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
// Dashed series — e.g. a setpoint drawn against its measured value
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — dashed series", () => {
  function renderWithDash() {
    return render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={[
          { key: "temperature", label: "Temperature" },
          { key: "humidity", label: "Humidity", dash: true },
        ]}
        lineValues={floatValues}
        width={WIDTH}
      />,
    );
  }

  it("renders a dash: true series with a dashed stroke", () => {
    const { container } = renderWithDash();
    const dashed = container.querySelectorAll('path[stroke-dasharray="6 4"]');
    expect(dashed.length).toBe(1);
  });

  it("stripes the dashed series' legend swatch", () => {
    renderWithDash();
    expect(swatchFor("Humidity").style.backgroundImage).toContain(
      "repeating-linear-gradient",
    );
    expect(swatchFor("Temperature").style.backgroundImage).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Integer series — share the float panel, rendered as step lines
// ---------------------------------------------------------------------------

describe("TimeSeriesChart — integer series", () => {
  it("renders int series in the shared float panel (single SVG)", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        intSeries={intSeries}
        intValues={intValues}
        width={WIDTH}
      />,
    );
    // Float + int share one panel → exactly one XYChart SVG
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBe(1);
    expect(screen.getByText("CO2")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
  });

  it("renders the float panel from int-only data", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        intSeries={intSeries}
        intValues={intValues}
        width={WIDTH}
      />,
    );
    const svgs = container.querySelectorAll(XYCHART_SVG);
    expect(svgs.length).toBe(1);
    expect(screen.getByText("CO2")).toBeInTheDocument();
  });

  it("renders int series with line swatches", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        intSeries={intSeries}
        intValues={intValues}
        width={WIDTH}
      />,
    );
    // Float (2) + int (1) series all use the 16px × 3px line swatch
    const lineSwatches = Array.from(
      container.querySelectorAll<HTMLSpanElement>("span"),
    ).filter(
      (span) => span.style.width === "16px" && span.style.height === "3px",
    );
    expect(lineSwatches.length).toBe(floatSeries.length + intSeries.length);
  });

  it("formats int values without decimals in the tooltip", () => {
    const result = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        intSeries={intSeries}
        intValues={intValues}
        width={WIDTH}
      />,
    );
    const wrapper = result.container.firstElementChild!;
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
    fireEvent.pointerMove(wrapper, { clientX: 400, clientY: 200 });

    const tooltip = document.querySelector(".bg-popover");
    expect(tooltip).not.toBeNull();
    const text = tooltip!.textContent!;
    expect(text).toContain("CO2");
    // Integer values render as whole numbers, never "450.00"
    expect(text).not.toMatch(/CO2[^\d]*\d+\.\d/);
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
    expect(screen.getByText("Other")).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Value axis units (AGR — "° on the y-axis")
// ---------------------------------------------------------------------------

describe("FloatPanel — value axis units", () => {
  /** Tick labels of the left (value) axis. */
  function leftAxisTicks(container: HTMLElement): string[] {
    const axis = container.querySelector("g.visx-axis-value");
    return Array.from(axis?.querySelectorAll("text") ?? []).map(
      (node) => node.textContent ?? "",
    );
  }

  it("suffixes the ticks when every series on the axis is a temperature", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={[
          { key: "temperature", label: "Temperature" },
          { key: "temperature_setpoint", label: "Setpoint" },
        ]}
        lineValues={{
          temperature: floatValues.temperature,
          temperature_setpoint: floatValues.temperature.map(() => 21),
        }}
        width={WIDTH}
      />,
    );
    const ticks = leftAxisTicks(container);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((tick) => tick.endsWith("°"))).toBe(true);
  });

  it("reads the attribute off semanticKey when the series is keyed otherwise", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={[
          {
            key: "device-1",
            label: "Room 101",
            semanticKey: "outlet_temperature",
          },
        ]}
        lineValues={{ "device-1": floatValues.temperature }}
        width={WIDTH}
      />,
    );
    const ticks = leftAxisTicks(container);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((tick) => tick.endsWith("°"))).toBe(true);
  });

  it("keeps tick labels free of whitespace", () => {
    // `@visx/text` wraps a label on whitespace, so "10 000 W" would render
    // stacked over three lines instead of on the tick.
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={[{ key: "active_power", label: "Power" }]}
        lineValues={{ active_power: timestamps.map((_, i) => 10000 + i * 500) }}
        width={WIDTH}
      />,
    );
    const ticks = leftAxisTicks(container);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((tick) => tick.endsWith("W"))).toBe(true);
    expect(ticks.some((tick) => /\s/.test(tick))).toBe(false);
  });

  it("leaves the axis bare when the series disagree on their unit", () => {
    // The shared fixture plots a temperature against a humidity.
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={floatSeries}
        lineValues={floatValues}
        width={WIDTH}
      />,
    );
    const ticks = leftAxisTicks(container);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.some((tick) => tick.includes("°"))).toBe(false);
  });

  it("leaves the axis bare for an attribute with no knowable unit", () => {
    const { container } = render(
      <TimeSeriesChartInner
        timestamps={timestamps}
        lineSeries={[{ key: "pressure", label: "Pressure" }]}
        lineValues={{ pressure: floatValues.temperature }}
        width={WIDTH}
      />,
    );
    const ticks = leftAxisTicks(container);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((tick) => /^[\d.,-]+$/.test(tick))).toBe(true);
  });
});
