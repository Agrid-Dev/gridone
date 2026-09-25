import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { AttributeSlot, Fluid, Synoptic } from "@gridone/sdk";
import { SynopticRenderer } from "@/components/synoptic/SynopticRenderer";
import type { SlotReading, SynopticValues } from "@/components/synoptic/values";
import { createI18nMock } from "@/test/i18nMock";
import type { PageVocabulary } from "./usePlateVocabulary";

vi.mock("react-i18next", () =>
  createI18nMock({
    "view.plan": "Plan",
    "view.isometric": "Isométrique",
    "print.valuesAt": "Valeurs au {{date}}",
    "legend.title": "Légende",
    "legend.circulating": "fluide en circulation",
    "fluids.primary_supply": "Primaire départ",
  }),
);

import { PlatePrintSheet } from "./PlatePrintSheet";

const cell = (x: number, y: number) =>
  ({ kind: "cell", cell: { x, y } }) as const;
const attr = (attribute: string): AttributeSlot => ({
  kind: "attribute",
  target: { devices: { ids: ["PAC-03"] }, attribute },
});
const live = (text: string, raw: SlotReading["raw"]): SlotReading => ({
  text,
  unit: null,
  raw,
  stale: false,
  faulty: false,
});

/** An isometric plate whose one run reads its fluid moving. */
const DOC: Synoptic = {
  id: "ecs",
  name: "ECS Est",
  metadata: {},
  projection: "isometric",
  symbols: [
    {
      id: "pac",
      type: "heat_pump",
      placement: cell(0, 0),
      label: "PAC 03",
      device_id: "PAC-03",
    },
    { id: "b01", type: "tank", placement: cell(6, 0), label: "B01" },
  ],
  pipes: [
    {
      id: "supply",
      fluid: "primary_supply",
      from: cell(0, 5),
      to: cell(8, 5),
      waypoints: [],
      tags: [],
      flow: attr("onoff_state"),
    },
  ],
  labels: [],
};
const VALUES: SynopticValues = {
  slots: { "pipe.supply.flow": live("MARCHE", true) },
  devices: {},
};
const VOCABULARY: PageVocabulary = {
  slotLabel: (slot) => slot,
  typeLabel: (type) => `T:${type}`,
  readingTime: () => "10:30:00",
};

function renderSheet(
  props: Partial<Parameters<typeof PlatePrintSheet>[0]> = {},
) {
  return render(
    <div data-page>
      <PlatePrintSheet
        doc={DOC}
        name="ECS Est"
        description="Eau chaude sanitaire, aile est"
        projection="isometric"
        values={VALUES}
        knownSynoptics={new Set(["ecs"])}
        vocabulary={VOCABULARY}
        fluids={new Set<Fluid>(["primary_supply"])}
        types={new Set(["heat_pump", "tank"])}
        {...props}
      />
    </div>,
  );
}

const sheet = () => document.querySelector<HTMLElement>("[data-print-sheet]")!;
/** Text the canvas holds larger than drawn: grown about its own anchor. */
const heldText = (root: Element) =>
  [...root.querySelectorAll("g[transform]")].filter((g) =>
    /scale\([\d.]+\) translate\(/.test(g.getAttribute("transform")!),
  );

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(SVGSVGElement.prototype, "getBoundingClientRect");
});

describe("PlatePrintSheet", () => {
  it("prints at the end of the body, out of the page it is mounted in", () => {
    const { container } = renderSheet();
    expect(sheet().parentElement).toBe(document.body);
    expect(container.querySelector("[data-print-sheet]")).toBeNull();
  });

  it("stays off the screen and shows on paper alone", () => {
    renderSheet();
    const classes = sheet().classList;
    expect(classes.contains("hidden")).toBe(true);
    expect(classes.contains("print:flex")).toBe(true);
    // A bare `flex` would fight `hidden` on screen.
    expect(classes.contains("flex")).toBe(false);
  });

  it("heads the sheet with the plate's name, its description, when its values were read and in which view", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 24, 10, 30));
    renderSheet();
    const header = sheet().querySelector("header")!;
    expect(header.querySelector("h1")?.textContent).toBe("ECS Est");
    expect(header.textContent).toContain("Eau chaude sanitaire, aile est");
    expect(header.textContent).toContain(
      "Valeurs au 24 septembre 2026 à 10:30 · Isométrique",
    );
  });

  it("names the plan view when the plate is printed in plan, and writes no description when the plate has none", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 5, 8, 5));
    renderSheet({ projection: "flat", description: null });
    const header = sheet().querySelector("header")!;
    expect(header.textContent).toContain(
      "Valeurs au 5 janvier 2026 à 08:05 · Plan",
    );
    // The name alone on the left: no empty paragraph under it.
    expect(header.firstElementChild!.children).toHaveLength(1);
  });

  it("stands the fluid still on paper, where the screen moves it", () => {
    // The same plate on screen moves its run: the stimulus is armed.
    const { container } = render(
      <SynopticRenderer doc={DOC} values={VALUES} vocabulary={VOCABULARY} />,
    );
    expect(container.querySelector("path.animate-flow")).not.toBeNull();
    cleanup();

    renderSheet();
    expect(sheet().querySelector("svg.bg-synoptic-plate")).not.toBeNull();
    expect(sheet().querySelector("path.animate-flow")).toBeNull();
  });

  it("prints the whole legend of the plate, with no moving run in it", () => {
    renderSheet();
    const legend = sheet().querySelector("[aria-label='Légende']")!;
    expect(
      legend.querySelector("[data-legend='fluid-primary_supply']"),
    ).not.toBeNull();
    expect(legend.querySelector("[data-legend='circulating']")).toBeNull();
    expect(
      [...sheet().querySelectorAll("[data-legend-symbol]")].map((dd) =>
        dd.getAttribute("data-legend-symbol"),
      ),
    ).toEqual(["heat_pump", "tank"]);
  });

  it("prints every label at its drawn size: a PDF zooms, so no text is held larger nor gives way", () => {
    // A small canvas: on screen, the floor holds the text above its size.
    Object.defineProperty(SVGSVGElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 160,
        bottom: 90,
        width: 160,
        height: 90,
        toJSON: () => ({}),
      }),
    });
    const { container } = render(
      <SynopticRenderer
        doc={DOC}
        values={VALUES}
        vocabulary={VOCABULARY}
        minTextPx={12}
      />,
    );
    expect(heldText(container).length).toBeGreaterThan(0);
    cleanup();

    renderSheet();
    expect(heldText(sheet())).toEqual([]);
    expect(sheet().querySelector("[data-text-hidden]")).toBeNull();
  });
});
