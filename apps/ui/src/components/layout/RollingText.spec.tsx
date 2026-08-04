import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { RollingText } from "./RollingText";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RollingText", () => {
  it("renders the value once when nothing has changed", () => {
    render(<RollingText value="16:45" />);
    // The sizer copy plus the visible one.
    expect(screen.getAllByText("16:45")).toHaveLength(2);
  });

  it("keeps both values on screen during the swap, old rising and new climbing", () => {
    const { rerender, container } = render(<RollingText value="16:45" />);
    rerender(<RollingText value="16:46" />);

    expect(screen.getByText("16:45")).toHaveClass("animate-roll-out");
    expect(container.querySelector(".animate-roll-in")?.textContent).toBe(
      "16:46",
    );
  });

  it("drops the outgoing value once the animation is over", () => {
    const { rerender } = render(<RollingText value="16:45" />);
    rerender(<RollingText value="16:46" />);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.queryByText("16:45")).not.toBeInTheDocument();
    expect(screen.getAllByText("16:46")).toHaveLength(2);
  });

  it("does not animate on first render", () => {
    const { container } = render(<RollingText value="16:45" />);
    expect(container.querySelector(".animate-roll-in")).toBeNull();
    expect(container.querySelector(".animate-roll-out")).toBeNull();
  });
});
