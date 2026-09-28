import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FleetLeadView } from "./FleetLeadView";

afterEach(cleanup);

describe("FleetLeadView", () => {
  it("renders both lines, each value with its label", () => {
    render(
      <FleetLeadView
        lead={{
          primary: { value: "21,0 °C", label: "consigne" },
          secondary: { value: "19,6 °C", label: "mesurée" },
        }}
      />,
    );
    expect(screen.getByText("21,0 °C")).toBeInTheDocument();
    expect(screen.getByText("consigne")).toBeInTheDocument();
    expect(screen.getByText("19,6 °C")).toBeInTheDocument();
    expect(screen.getByText("mesurée")).toBeInTheDocument();
  });

  it.each([undefined, null])(
    "renders nothing for an absent secondary line (%s), so a lone line centres on the glyph",
    (secondary) => {
      const { container } = render(
        <FleetLeadView lead={{ primary: { value: "En marche" }, secondary }} />,
      );
      expect(container.querySelectorAll("p")).toHaveLength(1);
    },
  );
});
