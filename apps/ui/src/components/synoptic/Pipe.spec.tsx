import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pipe } from "./Pipe";

const SHORT = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe("Pipe", () => {
  it("points both arrows outward on a short run", () => {
    const { container } = render(
      <svg>
        <Pipe points={SHORT} fluid="dhw" startArrow endArrow />
      </svg>,
    );
    const tips = [...container.querySelectorAll("polygon")].map(
      (p) => p.getAttribute("points")?.split(" ")[0],
    );
    expect(tips).toEqual(["100,0", "0,0"]);
    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      "M 14 0 L 86 0",
    );
  });

  it("draws the flow dash on the capped path, not through the arrow", () => {
    const { container } = render(
      <svg>
        <Pipe points={SHORT} fluid="dhw" endArrow flowing />
      </svg>,
    );
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[1].getAttribute("d")).toBe(paths[0].getAttribute("d"));
  });

  it("dims a stopped pipe and draws no dash", () => {
    const { container } = render(
      <svg>
        <Pipe points={SHORT} fluid="dhw" flowing={false} />
      </svg>,
    );
    expect(container.querySelector("g")?.getAttribute("opacity")).toBe("0.45");
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });
});
