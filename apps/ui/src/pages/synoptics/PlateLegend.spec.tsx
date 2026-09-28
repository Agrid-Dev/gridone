import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Fluid } from "@gridone/sdk";
import { DRAWINGS } from "@/components/synoptic/symbols/drawings";
import { READING_STATES } from "@/components/synoptic/values";
import { FLUID_FILL_CLASS, FLUIDS } from "@/lib/fluidColors";
import { SEVERITIES } from "@/lib/severity";
import { createI18nMock } from "@/test/i18nMock";
import { PlateLegend } from "./PlateLegend";
import type { PageVocabulary } from "./usePlateVocabulary";

vi.mock("react-i18next", () =>
  createI18nMock({
    "legend.title": "Légende",
    "legend.symbols": "Symboles",
    "legend.live": "valeur en direct",
    "legend.stale": "valeur ancienne",
    "legend.silent": "aucune valeur",
    "legend.note": "donnée saisie, non mesurée",
    "legend.fault": "Défaut",
    "legend.led.on": "en marche",
    "legend.led.off": "à l'arrêt",
    "legend.led.unknown": "état inconnu",
    "legend.missingLink": "renvoi vers une vue absente",
    "legend.circulating": "fluide en circulation",
    "common.severity.alert": "alerte",
    "common.severity.warning": "avertissement",
    "common.severity.info": "info",
    "fluids.primary_supply": "Primaire départ",
    "fluids.dhw": "ECS",
    "fluids.cold_water": "Eau froide",
    "fluids.condenser_return": "Condenseur retour",
  }),
);

afterEach(cleanup);

const vocabulary: PageVocabulary = {
  slotLabel: (slot) => slot,
  typeLabel: (type) => `T:${type}`,
  fluidLabel: (fluid) => fluid,
  readingTime: () => "12:00:00",
};

/** The fluid swatches drawn, in DOM order: the class of each and the
 *  name beside it. */
const swatches = () =>
  [
    ...screen
      .getByLabelText("Légende")
      .querySelectorAll("[data-legend^='fluid-']"),
  ].map((dd) => ({
    fill: dd.querySelector("rect")!.getAttribute("class"),
    name: dd.textContent,
  }));

const entries = (label: string) =>
  [...screen.getByLabelText(label).querySelectorAll("dd")].map(
    (dd) =>
      dd.getAttribute("data-legend") ?? dd.getAttribute("data-legend-symbol"),
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

  it("explains every state the plate draws, even with no fluid: each reading state, each severity, the LED, a missing link", () => {
    render(<PlateLegend fluids={new Set<Fluid>()} />);
    const legend = screen.getByLabelText("Légende");
    expect(legend.querySelector("dt")?.textContent).toBe("Légende");
    expect(swatches()).toEqual([]);
    expect(entries("Légende")).toEqual([
      ...READING_STATES.map((state) => `reading-${state}`),
      ...[...SEVERITIES].reverse().map((severity) => `fault-${severity}`),
      "led-on",
      "led-off",
      "led-unknown",
      "missing-link",
    ]);
    // Worded, not keyed.
    expect(legend.textContent).toContain("valeur en direct");
    expect(legend.textContent).toContain("Défaut · alerte");
    expect(legend.textContent).toContain("Défaut · info");
    expect(legend.textContent).toContain("renvoi vers une vue absente");
  });

  it("draws each state with the plate's own chip, badge and LED, so the legend cannot drift from the plate", () => {
    render(<PlateLegend fluids={new Set<Fluid>()} />);
    const legend = screen.getByLabelText("Légende");
    const chip = (state: string) =>
      legend.querySelector(`[data-legend='reading-${state}'] [data-chip]`)!;
    // The sample reading wears the colour a live reading has on the plate.
    expect(
      chip("live").querySelector(".fill-synoptic-reading")?.textContent,
    ).toBe("52,4");
    expect(
      chip("stale").querySelector("rect")!.getAttribute("stroke-dasharray"),
    ).toBe("3 2");
    expect(chip("silent").textContent).toContain("–");
    expect(chip("note").getAttribute("data-chip")).toBe("note");
    // The fault badge at each severity, in the fault's colour.
    expect(
      legend
        .querySelector(
          "[data-legend='fault-alert'] [data-fault='alert'] circle",
        )!
        .getAttribute("class"),
    ).toBe("fill-status-error");
    expect(
      legend
        .querySelector("[data-legend='fault-warning'] circle")!
        .getAttribute("class"),
    ).toBe("fill-status-warning");
    expect(
      legend
        .querySelector("[data-legend='fault-info'] circle")!
        .getAttribute("class"),
    ).toBe("fill-muted-foreground");
    // The LED of the sheet.
    expect(
      legend
        .querySelector("[data-legend='led-on'] [data-led='on']")!
        .getAttribute("class"),
    ).toBe("fill-status-ok");
    expect(
      legend
        .querySelector("[data-legend='led-off'] [data-led='off']")!
        .getAttribute("class"),
    ).toBe("fill-muted-foreground");
  });

  it("keys the symbol types the plate draws, named and sorted, with the sheet's own glyph; a type the kit cannot draw is left out", () => {
    render(
      <PlateLegend
        fluids={new Set<Fluid>()}
        types={new Set(["tank", "collector", "heat_pump", "pump", "unknown"])}
        vocabulary={vocabulary}
      />,
    );
    expect(entries("Symboles")).toEqual(["heat_pump", "pump", "tank"]);
    const key = screen.getByLabelText("Symboles");
    expect(key.textContent).toContain("T:heat_pump");
    // The thumbnail is the plan glyph itself: a heat pump's frame and
    // compressor, in a viewBox around its 2 x 2 footprint.
    const thumb = key.querySelector("[data-legend-symbol='heat_pump'] svg")!;
    expect(thumb.getAttribute("viewBox")).toBe("-18 -18 116 116");
    expect(thumb.querySelectorAll("polygon").length).toBeGreaterThan(1);
    expect(Object.keys(DRAWINGS)).not.toContain("collector");
  });

  it("explains a moving run only for a plate that moves, drawn moving in the first fluid the plate carries, just after the fluids", () => {
    render(
      <PlateLegend
        fluids={new Set<Fluid>(["condenser_return", "dhw"])}
        circulating
      />,
    );
    const legend = screen.getByLabelText("Légende");
    const item = legend.querySelector("[data-legend='circulating']")!;
    expect(item.textContent).toBe("fluide en circulation");
    expect(item.querySelector("path.animate-flow")).not.toBeNull();
    // The fluid's own stroke: `dhw` comes before `condenser_return`.
    expect(item.querySelector("path.stroke-fluid-dhw")).not.toBeNull();
    expect(entries("Légende").slice(0, 4)).toEqual([
      "fluid-dhw",
      "fluid-condenser_return",
      "circulating",
      "reading-live",
    ]);

    cleanup();
    render(<PlateLegend fluids={new Set<Fluid>(["dhw"])} />);
    expect(
      screen
        .getByLabelText("Légende")
        .querySelector("[data-legend='circulating']"),
    ).toBeNull();
    expect(document.querySelector("path.animate-flow")).toBeNull();
  });

  it("shows no key without types or without a vocabulary", () => {
    render(<PlateLegend fluids={new Set<Fluid>()} types={new Set(["pump"])} />);
    expect(screen.getByLabelText("Symboles").textContent).toContain("pump");
    cleanup();
    render(
      <PlateLegend
        fluids={new Set<Fluid>()}
        types={new Set()}
        vocabulary={vocabulary}
      />,
    );
    expect(screen.queryByLabelText("Symboles")).toBeNull();
  });
});
