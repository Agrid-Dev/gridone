import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientToSvg, useSvgDrag } from "./useSvgDrag";

/** jsdom has no layout, so fake the viewBox transform: `scale` client units
 *  per viewBox unit, or no transform at all. */
function stubScreenCtm(scale: number | null) {
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    value: () =>
      scale === null ? null : { inverse: () => ({ a: 1 / scale }) },
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

describe("clientToSvg", () => {
  it("passes client coordinates through when the svg has no transform", () => {
    stubScreenCtm(null);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(clientToSvg(svg, 12, 34)).toEqual({ x: 12, y: 34 });
  });

  it("maps client coordinates through the inverse screen transform", () => {
    stubScreenCtm(2);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    expect(clientToSvg(svg, 12, 34)).toEqual({ x: 6, y: 17 });
  });
});

function Draggable(props: Parameters<typeof useSvgDrag>[0]) {
  const drag = useSvgDrag(props);
  return (
    <svg>
      <rect data-testid="handle" {...drag} />
    </svg>
  );
}

const DOWN = { button: 0, pointerId: 1, clientX: 20, clientY: 40 };

function setup(props: Partial<Parameters<typeof useSvgDrag>[0]> = {}) {
  stubScreenCtm(2);
  const spies = {
    onStart: vi.fn(),
    onMove: vi.fn(),
    onEnd: vi.fn(),
    onCancel: vi.fn(),
  };
  const utils = render(<Draggable {...spies} {...props} />);
  return { ...spies, ...utils, handle: utils.getByTestId("handle") };
}

describe("useSvgDrag", () => {
  it("keeps the browser from scrolling the handle and owns the press", () => {
    const { handle } = setup();
    expect(handle.style.touchAction).toBe("none");
    const press = new PointerEvent("pointerdown", {
      button: 0,
      pointerId: 1,
      bubbles: true,
      cancelable: true,
    });
    handle.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it("reports start, per-move deltas and end in viewBox units", () => {
    const { handle, onStart, onMove, onEnd } = setup();
    fireEvent.pointerDown(handle, DOWN);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 40 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 50, clientY: 60 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 60 });

    expect(onStart).toHaveBeenCalledWith({ x: 10, y: 20 });
    expect(onMove).toHaveBeenNthCalledWith(
      1,
      { x: 15, y: 20 },
      { x: 5, y: 0 },
      { x: 10, y: 20 },
    );
    expect(onMove).toHaveBeenNthCalledWith(
      2,
      { x: 25, y: 30 },
      { x: 10, y: 10 },
      { x: 10, y: 20 },
    );
    expect(onEnd).toHaveBeenCalledWith({ x: 25, y: 30 });

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 99, clientY: 99 });
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it("ignores every pointer but the one that started the drag", () => {
    const { handle, onMove, onEnd } = setup();
    fireEvent.pointerDown(handle, DOWN);
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 90, clientY: 90 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 90, clientY: 90 });
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(onEnd).toHaveBeenCalledWith({ x: 15, y: 20 });
  });

  it("reverts on pointercancel instead of committing", () => {
    const { handle, onMove, onEnd, onCancel } = setup();
    fireEvent.pointerDown(handle, DOWN);
    fireEvent.pointerCancel(window, { pointerId: 1, clientX: 3, clientY: 4 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 9, clientY: 9 });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("cancels a drag in progress when another pointer starts one", () => {
    const { handle, onStart, onCancel, onEnd } = setup();
    fireEvent.pointerDown(handle, DOWN);
    fireEvent.pointerDown(handle, { ...DOWN, pointerId: 2 });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(2);

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 30, clientY: 40 });
    expect(onEnd).toHaveBeenCalledWith({ x: 15, y: 20 });
  });

  it("cancels the drag when the component unmounts", () => {
    const { handle, onMove, onCancel, unmount } = setup();
    fireEvent.pointerDown(handle, DOWN);
    unmount();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 9, clientY: 9 });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("waits for the threshold before capturing, so a click stays a click", () => {
    const capture = vi.spyOn(Element.prototype, "setPointerCapture");
    const { handle, onStart, onMove, onEnd } = setup({ threshold: 5 });
    fireEvent.pointerDown(handle, DOWN);
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 23, clientY: 40 });
    expect(onStart).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith({ x: 10, y: 20 });
    expect(onMove).toHaveBeenCalledWith(
      { x: 15, y: 20 },
      { x: 5, y: 0 },
      { x: 10, y: 20 },
    );
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 30, clientY: 40 });
    expect(onEnd).toHaveBeenCalledWith({ x: 15, y: 20 });
  });

  it("reports nothing for a press released under the threshold", () => {
    const { handle, onStart, onEnd, onCancel } = setup({ threshold: 5 });
    fireEvent.pointerDown(handle, DOWN);
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 21, clientY: 40 });
    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("ignores buttons other than the primary one", () => {
    const { handle, onStart } = setup();
    fireEvent.pointerDown(handle, { ...DOWN, button: 2 });
    expect(onStart).not.toHaveBeenCalled();
  });
});
