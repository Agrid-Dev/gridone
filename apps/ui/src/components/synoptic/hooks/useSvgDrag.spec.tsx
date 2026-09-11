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
  const onPointerDown = useSvgDrag(props);
  return (
    <svg>
      <rect data-testid="handle" onPointerDown={onPointerDown} />
    </svg>
  );
}

describe("useSvgDrag", () => {
  it("reports start, per-move deltas and end in viewBox units", () => {
    stubScreenCtm(2);
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { getByTestId } = render(
      <Draggable onStart={onStart} onMove={onMove} onEnd={onEnd} />,
    );
    const handle = getByTestId("handle");

    fireEvent.pointerDown(handle, { button: 0, clientX: 20, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 30, clientY: 40 });
    fireEvent.pointerMove(window, { clientX: 50, clientY: 60 });
    fireEvent.pointerUp(window, { clientX: 50, clientY: 60 });

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

    fireEvent.pointerMove(window, { clientX: 99, clientY: 99 });
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it("ends the drag on pointercancel", () => {
    stubScreenCtm(1);
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { getByTestId } = render(<Draggable onMove={onMove} onEnd={onEnd} />);
    fireEvent.pointerDown(getByTestId("handle"), { button: 0 });
    fireEvent.pointerCancel(window, { clientX: 3, clientY: 4 });
    fireEvent.pointerMove(window, { clientX: 9, clientY: 9 });
    expect(onEnd).toHaveBeenCalledWith({ x: 3, y: 4 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("drops the listeners when the component unmounts mid-drag", () => {
    stubScreenCtm(1);
    const onMove = vi.fn();
    const { getByTestId, unmount } = render(<Draggable onMove={onMove} />);
    fireEvent.pointerDown(getByTestId("handle"), { button: 0 });
    unmount();
    fireEvent.pointerMove(window, { clientX: 9, clientY: 9 });
    expect(onMove).not.toHaveBeenCalled();
  });

  it("ignores buttons other than the primary one", () => {
    stubScreenCtm(1);
    const onMove = vi.fn();
    const { getByTestId } = render(<Draggable onMove={onMove} />);
    fireEvent.pointerDown(getByTestId("handle"), { button: 2 });
    fireEvent.pointerMove(window, { clientX: 5, clientY: 5 });
    expect(onMove).not.toHaveBeenCalled();
  });
});
