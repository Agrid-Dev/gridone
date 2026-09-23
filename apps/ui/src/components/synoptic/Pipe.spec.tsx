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
    paths: [...container.querySelectorAll("path:not([data-casing])")].map((p) =>
      p.getAttribute("d"),
    ),
    casing: container.querySelector("path[data-casing]"),
    pipe: container.querySelector("path:not([data-casing])")!,
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
    expect(arrows).toEqual(["100,0 91,4.5 91,-4.5", "0,0 9,-4.5 9,4.5"]);
    expect(paths).toEqual(["M 6 0 L 94 0"]);
  });

  it("keeps both heads outward on a run shorter than two pull-backs", () => {
    const { paths, arrows } = draw({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      startArrow: true,
      endArrow: true,
    });
    expect(arrows).toEqual(["10,0 1,4.5 1,-4.5", "0,0 9,-4.5 9,4.5"]);
    expect(paths).toEqual(["M 5 0 L 5 0"]);
  });

  it("draws no head on a segment shorter than the head", () => {
    const { paths, arrows } = draw({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 6 },
      ],
      endArrow: true,
    });
    expect(arrows).toEqual([]);
    expect(paths).toEqual(["M 0 0 L 97 0 Q 100 0 100 3 L 100 6"]);
  });
});

describe("Pipe stroke", () => {
  it("is 6 px of fluid colour on a 10 px plate casing", () => {
    const { casing, pipe } = draw({ points: RUN });
    expect(pipe.getAttribute("stroke-width")).toBe("6");
    expect(pipe.getAttribute("class")).toBe("stroke-fluid-dhw");
    expect(casing?.getAttribute("stroke-width")).toBe("10");
    expect(casing?.getAttribute("class")).toBe("stroke-synoptic-plate");
    expect(casing?.getAttribute("d")).toBe(pipe.getAttribute("d"));
  });

  it("keeps the casing 4 px wider than a custom width", () => {
    const { casing, pipe } = draw({ points: RUN, width: 8 });
    expect(pipe.getAttribute("stroke-width")).toBe("8");
    expect(casing?.getAttribute("stroke-width")).toBe("12");
  });
});

describe("Pipe flow state", () => {
  it.each([undefined, false])(
    "is static at full strength when flow is %s",
    (flowing) => {
      const { g, paths } = draw({ points: RUN, flowing });
      expect(g.getAttribute("opacity")).toBeNull();
      expect(paths).toHaveLength(1);
    },
  );

  it("draws the flow dash on the capped path, not through the arrow", () => {
    const { paths } = draw({ points: RUN, endArrow: true, flowing: true });
    expect(paths).toEqual(["M 0 0 L 94 0", "M 0 0 L 94 0"]);
  });
});
