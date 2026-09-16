import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExternalLink } from "./ExternalLink";

describe("ExternalLink", () => {
  it("bounds the notch by the width so a narrow banner stays a banner", () => {
    const { container } = render(
      <svg>
        <ExternalLink
          x={20}
          y={0}
          w={40}
          h={60}
          fluid="dhw"
          direction="in"
          label="EF"
        />
      </svg>,
    );
    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      "M 20 0 L 40 0 L 60 30 L 40 60 L 20 60 Z",
    );
    expect(container.querySelector("text")?.getAttribute("x")).toBe("35");
  });
});
