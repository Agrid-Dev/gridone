import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pipe } from "./Pipe";

function draw(props: Omit<Parameters<typeof Pipe>[0], "fluid">) {
  const { container } = render(
    <svg>
      <Pipe fluid="dhw" {...props} />
    </svg>,
  );
  return {
    g: container.querySelector("g")!,
    paths: [...container.querySelectorAll("path")].map((p) =>
      p.getAttribute("d"),
    ),
    arrows: [...container.querySelectorAll("polygon")].map((p) =>
      p.getAttribute("points"),
    ),
  };
}

const RUN = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
];

describe("Pipe arrows", () => {
  it("points each head outward and pulls the line back behind it", () => {
    const { paths, arrows } = draw({
      points: RUN,
      startArrow: true,
      endArrow: true,
    });
    expect(arrows).toEqual(["100,0 83,8 83,-8", "0,0 17,-8 17,8"]);
    expect(paths).toEqual(["M 14 0 L 86 0"]);
  });

  it("keeps both heads outward on a run shorter than two pull-backs", () => {
    const { paths, arrows } = draw({
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      startArrow: true,
      endArrow: true,
    });
    expect(arrows).toEqual(["20,0 3,8 3,-8", "0,0 17,-8 17,8"]);
    expect(paths).toEqual(["M 10 0 L 10 0"]);
  });

  it("draws no head on a segment shorter than the head", () => {
    const { paths, arrows } = draw({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 8 },
      ],
      endArrow: true,
    });
    expect(arrows).toEqual([]);
    expect(paths).toEqual(["M 0 0 L 96 0 Q 100 0 100 4 L 100 8"]);
  });
});

describe("Pipe flow state", () => {
  it("is static and full strength when flow is not given", () => {
    const { g, paths } = draw({ points: RUN });
    expect(g.getAttribute("opacity")).toBe("1");
    expect(paths).toHaveLength(1);
  });

  it("draws the flow dash on the capped path, not through the arrow", () => {
    const { g, paths } = draw({ points: RUN, endArrow: true, flowing: true });
    expect(g.getAttribute("opacity")).toBe("1");
    expect(paths).toEqual(["M 0 0 L 86 0", "M 0 0 L 86 0"]);
  });

  it("dims a stopped pipe and draws no dash", () => {
    const { g, paths } = draw({ points: RUN, flowing: false });
    expect(g.getAttribute("opacity")).toBe("0.45");
    expect(paths).toHaveLength(1);
  });
});
