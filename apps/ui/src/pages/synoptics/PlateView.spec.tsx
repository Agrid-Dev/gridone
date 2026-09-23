import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { AttributeSlot, SymbolElement, Synoptic } from "@gridone/sdk";
import { ZOOM_STEP } from "@/components/synoptic/hooks/useViewport";
import type { SlotReading, SynopticValues } from "@/components/synoptic/values";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "view.projection": "Vue",
    "view.plan": "Plan",
    "view.isometric": "Isométrique",
    "view.zoomIn": "Agrandir",
    "view.zoomOut": "Réduire",
    "view.zoom": "Zoom {{percent}} %",
    "view.fit": "Ajuster",
    "view.fullscreen": "Plein écran",
    "view.exitFullscreen": "Quitter le plein écran",
    "nav.title": "Équipements",
    "nav.search": "Rechercher un équipement",
    "nav.toggle": "Afficher la liste des équipements",
    "nav.hide": "Masquer la liste des équipements",
    "legend.title": "Légende",
    "fluids.primary_supply": "Primaire départ",
    "fluids.dhw_loop": "Bouclage",
    "popover.label": "Appareil sélectionné",
    "popover.close": "Fermer",
    "popover.open": "Ouvrir l'appareil",
  }),
);

const mockUseDeviceById = vi.fn();
vi.mock("@/hooks/useDeviceById", () => ({
  useDeviceById: (id: string | undefined) => mockUseDeviceById(id),
}));
vi.mock("@/hooks/useAttributeCommandRuntime", () => ({
  useAttributeWriter: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { warning: vi.fn(), error: vi.fn() } }));

import { PlateView } from "./PlateView";

const cell = (x: number, y: number) =>
  ({ kind: "cell", cell: { x, y } }) as const;
const attr = (attribute: string): AttributeSlot => ({
  kind: "attribute",
  target: { devices: { ids: ["PAC-03"] }, attribute },
});
const device = (
  id: string,
  type: string,
  label: string,
  device_id: string,
  at: [number, number],
): SymbolElement => ({
  id,
  type,
  placement: cell(...at),
  label,
  device_id,
  bindings: { state: attr("onoff_state") },
});

const DOC: Synoptic = {
  id: "ecs",
  name: "ECS Est",
  metadata: {},
  projection: "flat",
  symbols: [
    device("pac", "heat_pump", "PAC 03", "PAC-03", [0, 0]),
    device("p1", "pump", "P1", "P-1", [5, 0]),
    device("heater", "loop_heater", "RÉCHAUFFEUR", "RCH-1", [0, 5]),
    device("v03", "valve_isolation", "V-03", "V-3", [5, 5]),
    { id: "b01", type: "tank", placement: cell(10, 0), label: "B01" },
    // Unnamed: drawn, but not listed.
    { id: "anon", type: "pump", placement: cell(10, 5) },
    {
      id: "to-west",
      type: "link",
      placement: cell(15, 0),
      label: "ECS OUEST",
      props: { synoptic_id: "west" },
    },
    {
      id: "to-gone",
      type: "link",
      placement: cell(15, 5),
      label: "GONE",
      props: { synoptic_id: "gone" },
    },
  ],
  // Back to front against the fluid vocabulary on purpose.
  pipes: [
    {
      id: "loop",
      fluid: "dhw_loop",
      from: cell(0, 9),
      to: cell(8, 9),
      waypoints: [],
      tags: [],
    },
    {
      id: "supply",
      fluid: "primary_supply",
      from: cell(0, 11),
      to: cell(8, 11),
      waypoints: [],
      tags: [],
    },
  ],
  labels: [],
};

const live = (text: string, raw: SlotReading["raw"]): SlotReading => ({
  text,
  unit: null,
  raw,
  stale: false,
  faulty: false,
});
const VALUES: SynopticValues = {
  slots: {
    "symbol.pac.state": live("MARCHE", true),
    "symbol.p1.state": live("ARRÊT", false),
    // An old reading says nothing about the state any more.
    "symbol.heater.state": { ...live("MARCHE", true), stale: true },
    "symbol.v03.state": live("OUVERTE", true),
  },
  devices: { "V-3": { faulty: true, severity: null } },
};

/**
 * jsdom lays nothing out: the screen matrix of a group is read off the
 * `transform` attributes from it up to the svg, one client px per viewBox
 * unit, so a popover anchor can be checked against the view.
 */
function screenMatrix(from: Element) {
  let m = { a: 1, d: 1, e: 0, f: 0 };
  for (
    let el: Element | null = from;
    el && el.tagName.toLowerCase() !== "svg";
    el = el.parentElement
  ) {
    const t = el.getAttribute("transform") ?? "";
    const move = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(t);
    const zoom = /scale\(([-\d.e]+)\)/.exec(t);
    const s = zoom ? Number(zoom[1]) : 1;
    const tx = move ? Number(move[1]) : 0;
    const ty = move ? Number(move[2]) : 0;
    m = { a: s * m.a, d: s * m.d, e: s * m.e + tx, f: s * m.f + ty };
  }
  return m;
}

function stubScreenCtm() {
  Object.defineProperty(SVGGElement.prototype, "getScreenCTM", {
    configurable: true,
    value(this: SVGGElement) {
      return screenMatrix(this);
    },
  });
  vi.stubGlobal(
    "DOMPoint",
    class {
      constructor(
        public x: number,
        public y: number,
      ) {}
      matrixTransform(m: { a: number; d: number; e: number; f: number }) {
        return { x: m.a * this.x + m.e, y: m.d * this.y + m.f };
      }
    },
  );
}

function renderView(doc: Synoptic = DOC) {
  const onNavigate = vi.fn();
  const { container } = render(
    <MemoryRouter>
      <PlateView
        doc={doc}
        values={VALUES}
        knownSynoptics={new Set(["ecs", "west"])}
        onNavigate={onNavigate}
      />
    </MemoryRouter>,
  );
  return { container, onNavigate };
}

const card = () => document.querySelector<HTMLElement>("[data-plate-view]")!;
/** The canvas, not the toolbar's icons: the one svg painted as a plate. */
const svg = () => card().querySelector<SVGSVGElement>("svg.bg-synoptic-plate")!;
/** The view transform: the group the canvas pans and zooms. */
const view = () => {
  const m = /translate\((\S+) (\S+)\) scale\((\S+)\)/.exec(
    svg().firstElementChild!.getAttribute("transform")!,
  )!;
  return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
};
const readout = () => screen.getByText(/^\d+ %$/);
const symbol = (id: string) => card().querySelector(`[data-symbol='${id}']`)!;
const hoverWrap = (id: string) => card().querySelector(`[data-hover='${id}']`)!;
const ring = (id: string) => card().querySelector(`[data-highlight='${id}']`);
const navRows = () =>
  [...card().querySelectorAll("[data-nav-symbol]")].map((row) =>
    row.getAttribute("data-nav-symbol"),
  );
const navRow = (id: string) =>
  card().querySelector<HTMLButtonElement>(`[data-nav-symbol='${id}']`)!;
const popover = () =>
  document.querySelector<HTMLElement>("[data-device-popover]");
/** The invisible element the popover positions itself against. */
const anchor = () => {
  const el = card().querySelector<HTMLElement>("svg.bg-synoptic-plate + div")!;
  return {
    left: parseFloat(el.style.left),
    top: parseFloat(el.style.top),
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height),
  };
};
const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  stubScreenCtm();
  mockUseDeviceById.mockImplementation((id: string) => ({
    data: { id, name: id, type: "awhp", attributes: {} },
    isLoading: false,
    error: null,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(SVGGElement.prototype, "getScreenCTM");
  Reflect.deleteProperty(document, "fullscreenElement");
  Reflect.deleteProperty(document, "exitFullscreen");
  mockUseDeviceById.mockReset();
});

describe("PlateView", () => {
  describe("projection", () => {
    it("opens in the document's projection and switches the view alone, leaving the document as stored", () => {
      const doc = structuredClone(DOC);
      const stored = JSON.stringify(doc);
      renderView(doc);
      // The sheet stands nothing on a slab; the isometric view does.
      expect(card().querySelector("[data-slab]")).toBeNull();
      expect(button("Plan").getAttribute("aria-pressed")).toBe("true");
      expect(button("Isométrique").getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(button("Isométrique"));

      expect(card().querySelector("[data-slab]")).not.toBeNull();
      expect(button("Plan").getAttribute("aria-pressed")).toBe("false");
      expect(button("Isométrique").getAttribute("aria-pressed")).toBe("true");
      expect(JSON.stringify(doc)).toBe(stored);

      fireEvent.click(button("Plan"));
      expect(card().querySelector("[data-slab]")).toBeNull();
    });

    it("opens a document that names no projection in the isometric view", () => {
      const doc = structuredClone(DOC);
      delete doc.projection;
      renderView(doc);
      expect(card().querySelector("[data-slab]")).not.toBeNull();
      expect(button("Isométrique").getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("toolbar", () => {
    it("zooms by one step per press, reads the zoom out, and fits again", () => {
      renderView();
      expect(view().scale).toBe(1);
      expect(readout().textContent).toBe("100 %");
      expect(readout().getAttribute("aria-label")).toBe("Zoom 100 %");

      fireEvent.click(button("Agrandir"));
      expect(view().scale).toBeCloseTo(ZOOM_STEP);
      expect(readout().textContent).toBe("125 %");
      expect(readout().getAttribute("aria-label")).toBe("Zoom 125 %");

      fireEvent.click(button("Agrandir"));
      expect(view().scale).toBeCloseTo(ZOOM_STEP * ZOOM_STEP);
      expect(readout().textContent).toBe("156 %");

      fireEvent.click(button("Réduire"));
      expect(view().scale).toBeCloseTo(ZOOM_STEP);
      expect(readout().textContent).toBe("125 %");

      fireEvent.click(button("Ajuster"));
      expect(view()).toEqual({ x: 0, y: 0, scale: 1 });
      expect(readout().textContent).toBe("100 %");
    });

    it("hides and shows the equipment list", () => {
      renderView();
      expect(
        screen.getByRole("navigation", { name: "Équipements" }),
      ).toBeTruthy();
      const toggle = button("Masquer la liste des équipements");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");

      fireEvent.click(toggle);
      expect(screen.queryByRole("navigation")).toBeNull();
      expect(
        button("Afficher la liste des équipements").getAttribute(
          "aria-pressed",
        ),
      ).toBe("false");

      fireEvent.click(button("Afficher la liste des équipements"));
      expect(
        screen.getByRole("navigation", { name: "Équipements" }),
      ).toBeTruthy();
    });

    it("gives every gesture to the canvas in full screen, and vertical swipes back to the page outside it", () => {
      let fullscreenElement: Element | null = null;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreenElement,
      });
      document.exitFullscreen = vi.fn(async () => {
        fullscreenElement = null;
      });
      renderView();
      card().requestFullscreen = vi.fn(async () => {
        fullscreenElement = card();
      });
      expect(svg().style.touchAction).toBe("pan-y");
      expect(card().className).not.toContain("h-screen");

      fireEvent.click(button("Plein écran"));
      expect(card().requestFullscreen).toHaveBeenCalledTimes(1);
      // The card follows the browser's word, not its own request.
      expect(svg().style.touchAction).toBe("pan-y");
      fireEvent(document, new Event("fullscreenchange"));

      expect(svg().style.touchAction).toBe("none");
      expect(card().className).toContain("h-screen");
      expect(
        button("Quitter le plein écran").getAttribute("aria-pressed"),
      ).toBe("true");

      fireEvent.click(button("Quitter le plein écran"));
      expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
      fireEvent(document, new Event("fullscreenchange"));
      expect(svg().style.touchAction).toBe("pan-y");
      expect(button("Plein écran").getAttribute("aria-pressed")).toBe("false");

      // Something else going full screen is not this card's business.
      fullscreenElement = document.body;
      fireEvent(document, new Event("fullscreenchange"));
      expect(svg().style.touchAction).toBe("pan-y");
    });
  });

  describe("equipment list", () => {
    it("lists the named symbols by name with their type and state, and leaves unnamed ones out", () => {
      renderView();
      expect(navRows()).toEqual([
        "b01",
        "to-west",
        "to-gone",
        "p1",
        "pac",
        "heater",
        "v03",
      ]);
      expect(navRow("pac").textContent).toBe("PAC 03heat pump");
      const dot = (id: string) =>
        navRow(id).querySelector("[data-state]")!.getAttribute("data-state");
      expect(dot("pac")).toBe("on");
      expect(dot("p1")).toBe("off");
      expect(dot("heater")).toBe("unknown");
      expect(dot("b01")).toBe("unknown");
      // Faulty, whatever it reads.
      expect(dot("v03")).toBe("fault");
    });

    it("rings on the plate the row under the pointer, and lights the row of the symbol under the pointer", () => {
      renderView();
      expect(ring("pac")).toBeNull();

      fireEvent.pointerEnter(hoverWrap("pac"));
      expect(navRow("pac").hasAttribute("data-highlighted")).toBe(true);
      expect(ring("pac")).not.toBeNull();
      fireEvent.pointerLeave(hoverWrap("pac"));
      expect(navRow("pac").hasAttribute("data-highlighted")).toBe(false);
      expect(ring("pac")).toBeNull();

      fireEvent.mouseEnter(navRow("b01"));
      expect(ring("b01")).not.toBeNull();
      expect(navRow("b01").hasAttribute("data-highlighted")).toBe(true);
      fireEvent.mouseLeave(navRow("b01"));
      expect(ring("b01")).toBeNull();
    });

    it("locates a selected row: centres the plate on it zoomed in, rings it, and opens its points when it is a device", () => {
      renderView();
      fireEvent.click(navRow("pac"));
      const onPac = view();
      expect(onPac.scale).toBe(2);
      expect(ring("pac")).not.toBeNull();
      expect(popover()?.getAttribute("data-device-popover")).toBe("pac");

      fireEvent.click(button("Fermer"));
      expect(popover()).toBeNull();

      // A tank with no device: located and ringed, nothing to open.
      fireEvent.click(navRow("b01"));
      expect(view().scale).toBe(2);
      expect(view()).not.toEqual(onPac);
      expect(ring("b01")).not.toBeNull();
      expect(popover()).toBeNull();
    });
  });

  describe("symbols", () => {
    it("opens the points of a device symbol, navigates on a link to a known plate, and does nothing else", () => {
      const { onNavigate } = renderView();
      fireEvent.click(symbol("to-west"));
      expect(onNavigate).toHaveBeenCalledWith("west");
      expect(popover()).toBeNull();

      // A link to no plate, and a drawn symbol that is no device: inert.
      fireEvent.click(symbol("to-gone"));
      expect(symbol("b01")).toBeNull();
      fireEvent.click(hoverWrap("b01"));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(popover()).toBeNull();

      fireEvent.click(symbol("pac"));
      expect(popover()?.getAttribute("data-device-popover")).toBe("pac");
      expect(mockUseDeviceById).toHaveBeenLastCalledWith("PAC-03");
      expect(screen.getByLabelText("Appareil sélectionné")).toBeInTheDocument();
      expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it("shows the points of the last symbol clicked", () => {
      renderView();
      fireEvent.click(symbol("pac"));
      fireEvent.click(symbol("p1"));
      expect(
        [...document.querySelectorAll("[data-device-popover]")].map((el) =>
          el.getAttribute("data-device-popover"),
        ),
      ).toEqual(["p1"]);
      expect(mockUseDeviceById).toHaveBeenLastCalledWith("P-1");
    });

    it("closes the points from their button and from Escape", () => {
      renderView();
      fireEvent.click(symbol("pac"));
      expect(popover()).not.toBeNull();
      fireEvent.click(button("Fermer"));
      expect(popover()).toBeNull();

      fireEvent.click(symbol("pac"));
      expect(popover()).not.toBeNull();
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
      expect(popover()).toBeNull();
    });

    it("anchors the points on the symbol's own box, and follows it through a zoom and a change of view", () => {
      renderView();
      expect(anchor()).toEqual({ left: 0, top: 0, width: 0, height: 0 });

      fireEvent.click(symbol("pac"));
      const atRest = anchor();
      expect(atRest.width).toBeGreaterThan(0);
      expect(atRest.height).toBeGreaterThan(0);

      fireEvent.click(button("Agrandir"));
      const zoomed = anchor();
      expect(zoomed.width).toBeCloseTo(atRest.width * ZOOM_STEP);
      expect(zoomed.height).toBeCloseTo(atRest.height * ZOOM_STEP);

      // The body sits elsewhere once projected.
      fireEvent.click(button("Isométrique"));
      expect(anchor()).not.toEqual(zoomed);
      expect(popover()?.getAttribute("data-device-popover")).toBe("pac");
    });
  });

  it("leaves the plate's title to the page header and draws its other labels", () => {
    renderView({
      ...DOC,
      labels: [
        { id: "title", at: { x: 0, y: -2 }, text: "PRODUCTION", role: "title" },
        { id: "note", at: { x: 0, y: 12 }, text: "non mesurée", role: "note" },
      ],
    });
    expect(card().querySelector("[data-label='title']")).toBeNull();
    expect(card().querySelector("[data-label='note']")).toHaveTextContent(
      "non mesurée",
    );
  });

  it("lists in the legend the fluids the plate's pipes carry, in the vocabulary's order", () => {
    renderView();
    const legend = screen.getByLabelText("Légende");
    const fluids = [...legend.querySelectorAll("[data-legend^='fluid-']")].map(
      (dd) => dd.textContent,
    );
    expect(fluids).toEqual(["Primaire départ", "Bouclage"]);
    // And the key names the types the plate draws, in the page's words.
    expect(
      [...screen.getByLabelText("legend.symbols").querySelectorAll("dd")].map(
        (dd) => dd.getAttribute("data-legend-symbol"),
      ),
    ).not.toHaveLength(0);
  });
});
