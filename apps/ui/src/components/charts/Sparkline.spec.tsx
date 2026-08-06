import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

afterEach(cleanup);

function pathOf(values: number[]): string {
  const { container } = render(<Sparkline values={values} />);
  return container.querySelector("path")?.getAttribute("d") ?? "";
}

describe("Sparkline", () => {
  it("spreads samples across the width and inverts the value axis", () => {
    // Lowest sample sits at the bottom (y = height), highest at the top.
    expect(pathOf([0, 10])).toBe("M0.00 24.00 L100.00 0.00");
  });

  it("scales to the series range, not to absolute values", () => {
    expect(pathOf([100, 105, 110])).toBe(pathOf([0, 5, 10]));
  });

  it("draws a flat series on the mid-line rather than dividing by zero", () => {
    expect(pathOf([7, 7, 7])).toBe("M0.00 12.00 L50.00 12.00 L100.00 12.00");
  });

  it("renders nothing below two samples", () => {
    const { container } = render(<Sparkline values={[42]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is exposed to assistive tech only when it is labelled", () => {
    render(<Sparkline values={[1, 2]} ariaLabel="24 h trend" />);
    expect(screen.getByRole("img", { name: "24 h trend" })).toBeInTheDocument();

    cleanup();
    const { container } = render(<Sparkline values={[1, 2]} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });
});
