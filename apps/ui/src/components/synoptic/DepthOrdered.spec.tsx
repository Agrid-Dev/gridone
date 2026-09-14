import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DepthOrdered } from "./DepthOrdered";

afterEach(cleanup);

describe("DepthOrdered", () => {
  it("renders items in ascending depth whatever their input order", () => {
    const { container } = render(
      <svg>
        <DepthOrdered
          items={[
            { id: "front", depth: 9, node: <rect /> },
            { id: "back", depth: -1, node: <rect /> },
            { id: "middle", depth: 3, node: <rect /> },
          ]}
        />
      </svg>,
    );
    const depths = [...container.querySelectorAll("g")].map((g) =>
      g.getAttribute("data-depth"),
    );
    expect(depths).toEqual(["-1", "3", "9"]);
  });

  it("keeps input order for equal depths", () => {
    const { container } = render(
      <svg>
        <DepthOrdered
          items={[
            { id: "a", depth: 1, node: <rect data-testid="a" /> },
            { id: "b", depth: 1, node: <rect data-testid="b" /> },
          ]}
        />
      </svg>,
    );
    const ids = [...container.querySelectorAll("rect")].map((r) =>
      r.getAttribute("data-testid"),
    );
    expect(ids).toEqual(["a", "b"]);
  });
});
