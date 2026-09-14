import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PidDiagram } from "./PidDiagram";

/** jsdom has no layout: two client px per viewBox unit. */
function stubScreenCtm() {
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    value: () => ({ inverse: () => ({ a: 0.5 }) }),
  });
  vi.stubGlobal(
    "DOMPoint",
    class {
      constructor(
        public x: number,
        public y: number,
      ) {}
      matrixTransform(m: { a: number }) {
        return { x: this.x * m.a, y: this.y * m.a };
      }
    },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  stubScreenCtm();
  const { container } = render(
    <PidDiagram width={100} height={50}>
      <rect />
    </PidDiagram>,
  );
  const svg = container.querySelector("svg")!;
  const content = svg.querySelector("g")!;
  const view = () => {
    const m = /translate\((\S+) (\S+)\) scale\((\S+)\)/.exec(
      content.getAttribute("transform")!,
    )!;
    return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
  };
  return { svg, view };
}

describe("PidDiagram", () => {
  it("starts fitted: identity transform, viewBox from its size", () => {
    const { svg, view } = setup();
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 50");
    expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
    expect(svg.style.touchAction).toBe("none");
  });

  it("pans by the drag delta in viewBox units", () => {
    const { svg, view } = setup();
    fireEvent.pointerDown(svg, {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 40,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 60 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 34, clientY: 60 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 34, clientY: 60 });
    expect(view()).toEqual({ x: 7, y: 10, scale: 1 });
  });

  it("zooms about the cursor and keeps the page from scrolling", () => {
    const { svg, view } = setup();
    const notScrolled = !fireEvent.wheel(svg, {
      deltaY: -100,
      clientX: 20,
      clientY: 40,
    });
    expect(notScrolled).toBe(true);
    const { x, y, scale } = view();
    expect(scale).toBeCloseTo(Math.exp(0.2), 5);
    // The point under the cursor, (10, 20) in viewBox units, stays put.
    expect(x + 10 * scale).toBeCloseTo(10, 5);
    expect(y + 20 * scale).toBeCloseTo(20, 5);
  });

  it("leaves a plain click alone: no pan, no pointer capture", () => {
    const capture = vi.spyOn(Element.prototype, "setPointerCapture");
    const { svg, view } = setup();
    fireEvent.pointerDown(svg, {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 40,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 21, clientY: 41 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 21, clientY: 41 });
    expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
    expect(capture).not.toHaveBeenCalled();
  });

  it("fits again on double click", () => {
    const { svg, view } = setup();
    fireEvent.wheel(svg, { deltaY: -100, clientX: 20, clientY: 40 });
    expect(view().scale).not.toBe(1);
    fireEvent.doubleClick(svg);
    expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("scales a line-mode wheel by the line height", () => {
    const { svg, view } = setup();
    fireEvent.wheel(svg, { deltaY: -1, deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect(view().scale).toBeCloseTo(Math.exp(0.032), 5);
  });

  it("clamps the zoom range", () => {
    const { svg, view } = setup();
    for (let i = 0; i < 30; i++) fireEvent.wheel(svg, { deltaY: -1000 });
    expect(view().scale).toBe(8);
    for (let i = 0; i < 60; i++) fireEvent.wheel(svg, { deltaY: 1000 });
    expect(view().scale).toBe(0.25);
  });
});
