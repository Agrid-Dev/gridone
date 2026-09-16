import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DepthOrdered } from "./DepthOrdered";

afterEach(cleanup);

const ids = (container: HTMLElement) =>
  [...container.querySelectorAll("rect")].map((r) =>
    r.getAttribute("data-testid"),
  );

describe("DepthOrdered", () => {
  it("renders items in ascending depth whatever their input order", () => {
    const { container } = render(
      <svg>
        <DepthOrdered
          items={[
            { id: "front", depth: 9, node: <rect data-testid="front" /> },
            { id: "back", depth: -1, node: <rect data-testid="back" /> },
            { id: "middle", depth: 3, node: <rect data-testid="middle" /> },
          ]}
        />
      </svg>,
    );
    expect(ids(container)).toEqual(["back", "middle", "front"]);
  });

  it("keeps input order for equal depths while still sorting the rest", () => {
    const { container } = render(
      <svg>
        <DepthOrdered
          items={[
            { id: "b", depth: 1, node: <rect data-testid="b" /> },
            { id: "a", depth: 1, node: <rect data-testid="a" /> },
            { id: "c", depth: 0, node: <rect data-testid="c" /> },
          ]}
        />
      </svg>,
    );
    expect(ids(container)).toEqual(["c", "b", "a"]);
  });
});
