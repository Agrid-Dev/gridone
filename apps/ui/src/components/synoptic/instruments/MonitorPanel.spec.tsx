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
    const { rects, texts } = draw({ w: 100, rows: [ROW] });
    const box = rects[1];
    const boxRight =
      Number(box.getAttribute("x")) + Number(box.getAttribute("width"));
    const unit = texts.find((t) => t.textContent === "°C")!;
    expect(boxRight).toBeLessThan(100);
    expect(Number(unit.getAttribute("x"))).toBeLessThan(100);
    expect(Number(unit.getAttribute("x"))).toBeGreaterThan(boxRight);
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
