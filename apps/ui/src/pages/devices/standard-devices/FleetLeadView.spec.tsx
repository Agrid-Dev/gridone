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
    "renders nothing for an absent secondary line (%s)",
    (secondary) => {
      const { container } = render(
        <FleetLeadView lead={{ primary: { value: "En marche" }, secondary }} />,
      );
      expect(container.querySelectorAll("p")).toHaveLength(1);
    },
  );

  it("greys the primary value when muted, and only it", () => {
    render(
      <FleetLeadView
        muted
        lead={{
          primary: { value: "16,0 °C", label: "consigne" },
          secondary: { value: "20,0 °C", label: "mesurée" },
        }}
      />,
    );
    expect(screen.getByText("16,0 °C")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("20,0 °C")).not.toHaveClass(
      "text-muted-foreground",
    );
  });

  it("keeps a line's own tone over the muting", () => {
    render(
      <FleetLeadView
        muted
        lead={{ primary: { value: "Liquide détecté", tone: "text-water" } }}
      />,
    );
    const value = screen.getByText("Liquide détecté");
    expect(value).toHaveClass("text-water");
    expect(value).not.toHaveClass("text-muted-foreground");
  });
});
