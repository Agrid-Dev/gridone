import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Fluid } from "@gridone/sdk";
import { FLUID_FILL_CLASS, FLUIDS } from "@/lib/fluidColors";
import { createI18nMock } from "@/test/i18nMock";
import { PlateLegend } from "./PlateLegend";

vi.mock("react-i18next", () =>
  createI18nMock({
    "legend.title": "Légende",
    "legend.live": "valeur en direct",
    "legend.fault": "Défaut",
    "legend.unmeasured": "Non instrumenté",
    "fluids.primary_supply": "Primaire départ",
    "fluids.dhw": "ECS",
    "fluids.cold_water": "Eau froide",
    "fluids.condenser_return": "Condenseur retour",
  }),
);

afterEach(cleanup);

/** The swatches drawn, in DOM order: the fluid class of each and the name
 *  beside it. */
const swatches = () =>
  [...screen.getByLabelText("Légende").querySelectorAll("svg rect")].map(
    (rect) => ({
      fill: rect.getAttribute("class"),
      name: rect.closest("dd")!.textContent,
    }),
  );

describe("PlateLegend", () => {
  it("lists the fluids the plate carries in the vocabulary's order, not the document's", () => {
    // Inserted back to front on purpose: the legend must follow FLUIDS.
    render(
      <PlateLegend
        fluids={new Set<Fluid>(["condenser_return", "dhw", "primary_supply"])}
      />,
    );
    expect(swatches()).toEqual([
      { fill: FLUID_FILL_CLASS.primary_supply, name: "Primaire départ" },
      { fill: FLUID_FILL_CLASS.dhw, name: "ECS" },
      { fill: FLUID_FILL_CLASS.condenser_return, name: "Condenseur retour" },
    ]);
    expect(screen.queryByText("Eau froide")).toBeNull();
  });

  it("draws every fluid of the vocabulary when a plate carries them all", () => {
    render(<PlateLegend fluids={new Set<Fluid>(FLUIDS)} />);
    expect(swatches().map((s) => s.fill)).toEqual(
      FLUIDS.map((fluid) => FLUID_FILL_CLASS[fluid]),
    );
  });

  it("always explains a live value, a fault and an uninstrumented point, even with no fluid", () => {
    render(<PlateLegend fluids={new Set<Fluid>()} />);
    const legend = screen.getByLabelText("Légende");
    expect(legend.querySelector("dt")?.textContent).toBe("Légende");
    expect(swatches()).toEqual([]);
    const fixed = [...legend.querySelectorAll("dd")].map((dd) =>
      dd.textContent?.trim(),
    );
    expect(fixed).toEqual([
      "52,4 °Cvaleur en direct",
      "Défaut",
      "Non instrumenté",
    ]);
    // The sample reading wears the colour a live reading has on the plate.
    expect(legend.querySelector(".text-synoptic-reading")?.textContent).toBe(
      "52,4 °C",
    );
  });
});
