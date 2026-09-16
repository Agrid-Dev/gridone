import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonitorPanel } from "./MonitorPanel";

const ROW = { label: "PV", value: 57.2, unit: "°C" };

function draw(props: Partial<Parameters<typeof MonitorPanel>[0]>) {
  const { container } = render(
    <svg>
      <MonitorPanel
        x={0}
        y={0}
        title="P-01"
        statuses={[]}
        rows={[]}
        {...props}
      />
    </svg>,
  );
  const rects = [...container.querySelectorAll("rect")];
  const texts = [...container.querySelectorAll("text")];
  return { rects, texts };
}

describe("MonitorPanel geometry", () => {
  it("keeps the value box and unit inside a narrow panel", () => {
    // 120 is above the 110 px minimum, so this is the panel's own width.
    const { rects, texts } = draw({ w: 120, rows: [ROW] });
    const right = Number(rects[0].getAttribute("width"));
    expect(right).toBe(120);
    const box = rects[1];
    const boxRight =
      Number(box.getAttribute("x")) + Number(box.getAttribute("width"));
    const unit = texts.find((t) => t.textContent === "°C")!;
    const unitX = Number(unit.getAttribute("x"));
    expect(boxRight).toBeLessThan(right);
    expect(unitX).toBeGreaterThan(boxRight);
    // The unit column is 50 px wide: the text starts inside it and a unit
    // as long as "m³/h" (4 glyphs at 13 px) still ends before the frame.
    expect(unitX + 4 * 13 * 0.6).toBeLessThan(right);
  });

  it("refuses to shrink below the width its columns need", () => {
    const { rects } = draw({ w: 60, rows: [ROW] });
    expect(Number(rects[0].getAttribute("width"))).toBe(110);
    expect(Number(rects[1].getAttribute("width"))).toBe(20);
  });

  it("draws only the indicators that fit the width", () => {
    const { rects } = draw({ statuses: ["ok", "ok", "ok", "ok", "ok", "ok"] });
    const squares = rects.slice(1);
    expect(squares).toHaveLength(5);
    const last = squares[squares.length - 1];
    expect(
      Number(last.getAttribute("x")) + Number(last.getAttribute("width")),
    ).toBeLessThanOrEqual(162);
  });
});
