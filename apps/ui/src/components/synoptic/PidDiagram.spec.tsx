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

function setup(props: Partial<Parameters<typeof PidDiagram>[0]> = {}) {
  stubScreenCtm();
  const { container } = render(
    <PidDiagram width={100} height={50} {...props}>
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
  });

  it("leaves one-finger vertical swipes to the page unless told to take every gesture", () => {
    expect(setup().svg.style.touchAction).toBe("pan-y");
    cleanup();
    expect(setup({ touchAction: "none" }).svg.style.touchAction).toBe("none");
  });

  it("leaves a press as the browser makes it until it becomes a pan", () => {
    const { svg } = setup();
    const press = new PointerEvent("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 40,
      bubbles: true,
      cancelable: true,
    });
    svg.dispatchEvent(press);
    // Not cancelled: focus, selection and the click that follows survive,
    // and the double click that fits the view with them.
    expect(press.defaultPrevented).toBe(false);
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

  it("leaves a plain wheel to the page, so an embedded plate does not trap the scroll", () => {
    const { svg, view } = setup();
    const scrolled = fireEvent.wheel(svg, {
      deltaY: -100,
      clientX: 20,
      clientY: 40,
    });
    expect(scrolled).toBe(true);
    expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("zooms about the cursor on ctrl or cmd with the wheel, and keeps the page from scrolling", () => {
    const { svg, view } = setup();
    const notScrolled = !fireEvent.wheel(svg, {
      deltaY: -100,
      clientX: 20,
      clientY: 40,
      ctrlKey: true,
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
    fireEvent.wheel(svg, {
      deltaY: -100,
      clientX: 20,
      clientY: 40,
      metaKey: true,
    });
    expect(view().scale).not.toBe(1);
    fireEvent.doubleClick(svg);
    expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("scales a line-mode wheel by the line height and a page-mode one by the page", () => {
    const line = setup();
    fireEvent.wheel(line.svg, {
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      ctrlKey: true,
    });
    expect(line.view().scale).toBeCloseTo(Math.exp(0.032), 5);
    cleanup();
    const page = setup();
    fireEvent.wheel(page.svg, {
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_PAGE,
      ctrlKey: true,
    });
    // One page notch is capped to the same step a 200 px wheel makes.
    expect(page.view().scale).toBeCloseTo(Math.exp(0.4), 5);
  });

  it("caps a single wheel event so a flung trackpad is one step, not a jump", () => {
    const { svg, view } = setup();
    fireEvent.wheel(svg, { deltaY: -5000, ctrlKey: true });
    expect(view().scale).toBeCloseTo(Math.exp(0.4), 5);
  });

  it("clamps the zoom range", () => {
    const { svg, view } = setup();
    for (let i = 0; i < 30; i++)
      fireEvent.wheel(svg, { deltaY: -1000, ctrlKey: true });
    expect(view().scale).toBe(8);
    for (let i = 0; i < 60; i++)
      fireEvent.wheel(svg, { deltaY: 1000, ctrlKey: true });
    expect(view().scale).toBe(0.25);
  });

  it("pinches with two pointers: zooms about the midpoint and follows it", () => {
    const capture = vi.spyOn(Element.prototype, "setPointerCapture");
    const { svg, view } = setup();
    // First finger starts a pan; the second turns it into a pinch.
    fireEvent.pointerDown(svg, {
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 40,
    });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(view()).toEqual({ x: 5, y: 0, scale: 1 });
    fireEvent.pointerDown(svg, {
      button: 0,
      pointerId: 2,
      clientX: 60,
      clientY: 40,
    });
    expect(capture).toHaveBeenCalledWith(1);
    expect(capture).toHaveBeenCalledWith(2);
    // Fingers at svg 15 and 30 spread to 10 and 40: the span doubles and
    // the midpoint moves from 22.5 to 25.
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 20, clientY: 40 });
    fireEvent.pointerMove(svg, { pointerId: 2, clientX: 80, clientY: 40 });
    const { x, y, scale } = view();
    expect(scale).toBeCloseTo(2, 5);
    // The content that was under the old midpoint (17.5 in content units
    // after the 5 px pan) now sits under the new one.
    expect(x + 17.5 * scale).toBeCloseTo(25, 5);
    expect(y + 20 * scale).toBeCloseTo(20, 5);
    // Once a finger lifts, the other keeps panning: pinch then drag to
    // reposition is one gesture on a touch screen.
    fireEvent.pointerUp(svg, { pointerId: 2, clientX: 80, clientY: 40 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 40, clientY: 40 });
    expect(view().x).toBe(x + 10);
    expect(view().scale).toBeCloseTo(scale, 5);
    // With every finger up, the next press is a plain drag again.
    fireEvent.pointerUp(svg, { pointerId: 1, clientX: 40, clientY: 40 });
    fireEvent.pointerDown(svg, {
      button: 0,
      pointerId: 3,
      clientX: 20,
      clientY: 40,
    });
    fireEvent.pointerMove(svg, { pointerId: 3, clientX: 30, clientY: 40 });
    expect(view().x).toBe(x + 15);
  });
});
