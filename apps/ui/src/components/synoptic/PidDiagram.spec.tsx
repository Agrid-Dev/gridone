import { createRef, useContext } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViewportController } from "./hooks/useViewport";
import { TextScaleContext } from "./legibility";
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

  it("zooms about the cursor on a plain wheel, and keeps the page from scrolling", () => {
    const { svg, view } = setup();
    const notScrolled = !fireEvent.wheel(svg, {
      deltaY: -100,
      clientX: 20,
      clientY: 40,
    });
    expect(notScrolled).toBe(true);
    const { x, y, scale } = view();
    // Literals, not the formula the hook uses: one 100 px notch is e^0.2,
    // so a wrong sensitivity constant fails here.
    expect(scale).toBeCloseTo(1.2214, 4);
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

  it("zooms the same on ctrl or cmd with the wheel: a trackpad pinch arrives that way", () => {
    const { svg, view } = setup();
    fireEvent.wheel(svg, {
      deltaY: -100,
      clientX: 20,
      clientY: 40,
      ctrlKey: true,
    });
    expect(view().scale).toBeCloseTo(1.2214, 4);
    cleanup();
    const meta = setup();
    fireEvent.wheel(meta.svg, {
      deltaY: -100,
      clientX: 20,
      clientY: 40,
      metaKey: true,
    });
    expect(meta.view().scale).toBeCloseTo(1.2214, 4);
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

  it("keeps its view on double click when told to, as an editor does", () => {
    const { svg, view } = setup({ fitOnDoubleClick: false });
    fireEvent.wheel(svg, { deltaY: -100, clientX: 20, clientY: 40 });
    const zoomed = view();
    expect(zoomed.scale).not.toBe(1);
    fireEvent.doubleClick(svg);
    expect(view()).toEqual(zoomed);
  });

  it("scales a line-mode wheel by the line height and a page-mode one by the page", () => {
    const line = setup();
    fireEvent.wheel(line.svg, {
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      ctrlKey: true,
    });
    expect(line.view().scale).toBeCloseTo(1.0325, 4);
    cleanup();
    const page = setup();
    fireEvent.wheel(page.svg, {
      deltaY: -1,
      deltaMode: WheelEvent.DOM_DELTA_PAGE,
      ctrlKey: true,
    });
    // One page notch is capped to the same step a 200 px wheel makes.
    expect(page.view().scale).toBeCloseTo(1.4918, 4);
  });

  it("caps a single wheel event so a flung trackpad is one step, not a jump", () => {
    const { svg, view } = setup();
    fireEvent.wheel(svg, { deltaY: -5000, ctrlKey: true });
    expect(view().scale).toBeCloseTo(1.4918, 4);
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

describe("PidDiagram controller", () => {
  const drive = () => {
    const controller = createRef<ViewportController | null>();
    const onViewChange = vi.fn();
    const { view } = setup({ controller, onViewChange });
    return { c: controller.current!, view, onViewChange };
  };

  it("zooms about the canvas centre and fits again", () => {
    const { c, view } = drive();
    act(() => c.zoomBy(2));
    // The centre of the 100 x 50 canvas, (50, 25), stays put: the content
    // shifts back by half its own size.
    expect(view()).toEqual({ x: -50, y: -25, scale: 2 });
    act(() => c.zoomBy(0.5));
    expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
    act(() => c.zoomBy(2));
    act(() => c.fit());
    expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("clamps a zoom step to the range, still about the centre", () => {
    const { c, view } = drive();
    act(() => c.zoomBy(100));
    expect(view()).toEqual({ x: -350, y: -175, scale: 8 });
    act(() => c.zoomBy(0.001));
    expect(view()).toEqual({ x: 37.5, y: 18.75, scale: 0.25 });
  });

  it("brings a point to the canvas centre at the scale asked, else at the current one", () => {
    const { c, view } = drive();
    act(() => c.centerOn({ x: 30, y: 10 }, 2));
    // (30, 10) scaled by 2 and shifted by the view lands on (50, 25).
    expect(view()).toEqual({ x: -10, y: 5, scale: 2 });
    act(() => c.centerOn({ x: 0, y: 0 }));
    expect(view()).toEqual({ x: 50, y: 25, scale: 2 });
    act(() => c.centerOn({ x: 30, y: 10 }, 100));
    expect(view()).toEqual({ x: 50 - 30 * 8, y: 25 - 10 * 8, scale: 8 });
  });

  it("reports every view and answers the current scale", () => {
    const { c, view, onViewChange } = drive();
    expect(onViewChange).toHaveBeenCalledWith({ x: 0, y: 0, scale: 1 });
    expect(c.scale()).toBe(1);
    act(() => c.zoomBy(2));
    expect(onViewChange).toHaveBeenLastCalledWith({ x: -50, y: -25, scale: 2 });
    expect(c.scale()).toBe(2);
    expect(view().scale).toBe(2);
  });
});

/** Reads the scale the canvas holds its text at. */
function ScaleProbe() {
  const k = useContext(TextScaleContext);
  return <rect data-text-scale={k} />;
}

describe("PidDiagram text floor", () => {
  let resize: (() => void) | null = null;
  /** What the canvas asked to be told about when it resizes. */
  let observed: Element[] = [];
  const size = { w: 0, h: 0 };

  /** A canvas laid out `w` × `h` screen px, whose observer the test fires. */
  function layout(w: number, h: number) {
    size.w = w;
    size.h = h;
    Object.defineProperty(SVGSVGElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: size.w, height: size.h }),
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          resize = cb;
        }
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      },
    );
  }

  afterEach(() => {
    // Back to jsdom's own, inherited from Element.
    delete (SVGSVGElement.prototype as { getBoundingClientRect?: unknown })
      .getBoundingClientRect;
    resize = null;
    observed = [];
  });

  function drawProbe(props: Partial<Parameters<typeof PidDiagram>[0]> = {}) {
    const controller = createRef<ViewportController | null>();
    const { container } = render(
      <PidDiagram width={100} height={50} controller={controller} {...props}>
        <ScaleProbe />
      </PidDiagram>,
    );
    const k = () =>
      Number(
        container
          .querySelector("[data-text-scale]")!
          .getAttribute("data-text-scale"),
      );
    return { k, c: controller };
  }

  it("holds the text at the floor once the fitted canvas shows it smaller", () => {
    // 100 × 50 units on 50 × 25 px: half a pixel per unit, so 11-unit text
    // shows 5.5 px and is held twice as large to show 11.
    layout(50, 25);
    const { k } = drawProbe({ minTextPx: 11, textSize: 11 });
    expect(k()).toBe(2);
  });

  it("fits by the tighter side, as the viewBox meets the canvas", () => {
    // Twice as tall as the plate's shape: the width decides, 0.5 px a unit.
    layout(50, 100);
    expect(drawProbe({ minTextPx: 11, textSize: 11 }).k()).toBe(2);
  });

  it("lets the text go as the view zooms in, and holds it again zoomed out", () => {
    layout(50, 25);
    const { k, c } = drawProbe({ minTextPx: 11, textSize: 11 });
    act(() => c.current!.zoomBy(2));
    expect(k()).toBe(1);
    act(() => c.current!.zoomBy(0.5));
    expect(k()).toBe(2);
  });

  it("follows the canvas when it is resized", () => {
    layout(50, 25);
    const { k } = drawProbe({ minTextPx: 11, textSize: 11 });
    expect(k()).toBe(2);
    // Only a canvas that is watched hears of its new size.
    expect(observed.some((el) => el instanceof SVGSVGElement)).toBe(true);
    size.w = 100;
    size.h = 50;
    act(() => resize!());
    expect(k()).toBe(1);
  });

  it("is 1 with no floor, and before the canvas is laid out", () => {
    layout(50, 25);
    expect(drawProbe({ textSize: 11 }).k()).toBe(1);
    cleanup();
    layout(0, 0);
    expect(drawProbe({ minTextPx: 11, textSize: 11 }).k()).toBe(1);
  });

  it("takes a text 1 unit high without a size", () => {
    layout(50, 25);
    // 2 px wanted of 1 unit at 0.5 px: four times.
    expect(drawProbe({ minTextPx: 2 }).k()).toBe(4);
  });
});
