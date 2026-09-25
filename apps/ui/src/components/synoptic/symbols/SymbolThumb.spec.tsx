import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SymbolThumb } from "./SymbolThumb";

afterEach(cleanup);

const thumb = (container: HTMLElement) => container.querySelector("svg")!;

describe("SymbolThumb", () => {
  it("fits a type's plan glyph to the height asked, keeping its proportions", () => {
    // A tank stands on one cell by two: narrower than tall.
    const { container } = render(<SymbolThumb type="tank" height={26} />);
    expect(thumb(container)).toHaveAttribute("height", "26");
    expect(thumb(container)).toHaveAttribute("width", "17");
    expect(thumb(container)).toHaveAttribute("viewBox", "-18 -18 76 116");
    expect(thumb(container)).toHaveAttribute("aria-hidden");
  });

  it("draws a square type square", () => {
    const { container } = render(<SymbolThumb type="heat_pump" height={20} />);
    expect(thumb(container)).toHaveAttribute("width", "20");
  });

  it("draws a collector, which has no footprint of its own, as a short bar", () => {
    const { container } = render(<SymbolThumb type="collector" height={26} />);
    // Two cells along x: wider than tall, one piece of bar per cell.
    expect(thumb(container)).toHaveAttribute("width", "40");
    expect(thumb(container).querySelectorAll("polygon")).toHaveLength(2);
  });

  it("draws nothing for a type the registry does not know", () => {
    const { container } = render(<SymbolThumb type="heat_recovery_wheel" />);
    // The twins above find the svg with this query.
    expect(container.querySelector("svg")).toBeNull();
  });
});
