import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { AttributeSlot, SymbolElement, Synoptic } from "@gridone/sdk";
import type { SlotReading, SynopticValues } from "@/components/synoptic/values";
import type { FaultRow } from "@/pages/faults/useFaultsPage";
import { createI18nMock } from "@/test/i18nMock";

vi.mock("react-i18next", () =>
  createI18nMock({
    "view.plan": "Plan",
    "view.isometric": "Isométrique",
    "view.legend": "Légende",
    "view.exportPdf": "Exporter en PDF",
    "nav.title": "Équipements",
    "nav.search": "Rechercher un équipement",
    "faults.title": "Défauts sur cette vue",
    "faults.none": "Aucun défaut actif.",
    "faults.count": "{{count}} défauts",
    "faults:faults.unableToLoad": "Impossible de charger les défauts",
    "description.title": "Description",
    "common:common.edit": "Modifier",
    "editor.new": "Nouveau synoptique",
    "popover.label": "Appareil sélectionné",
    "popover.close": "Fermer",
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

import { SynopticPage } from "./SynopticPage";

const cell = (x: number, y: number) =>
  ({ kind: "cell", cell: { x, y } }) as const;
const state: AttributeSlot = {
  kind: "attribute",
  target: { devices: { ids: ["PAC-03"] }, attribute: "onoff_state" },
};
const live = (text: string, raw: SlotReading["raw"]): SlotReading => ({
  text,
  unit: null,
  raw,
  stale: false,
  faulty: false,
});

const SYMBOLS: SymbolElement[] = [
  {
    id: "pac",
    type: "heat_pump",
    placement: cell(0, 0),
    label: "PAC 03",
    device_id: "PAC-03",
    bindings: { state },
  },
  { id: "b01", type: "tank", placement: cell(6, 0), label: "B01" },
  {
    id: "to-west",
    type: "link",
    placement: cell(12, 0),
    label: "ECS OUEST",
    props: { synoptic_id: "west" },
  },
];
const DOC: Synoptic = {
  id: "ecs",
  name: "ECS Est",
  description: "Eau chaude sanitaire, aile est",
  metadata: {},
  projection: "flat",
  symbols: SYMBOLS,
  pipes: [],
  labels: [],
};
const VALUES: SynopticValues = {
  slots: { "symbol.pac.state": live("MARCHE", true) },
  devices: {},
};
const fault = (device_id: string): FaultRow => ({
  device_id,
  device_name: device_id,
  attribute_name: "general_fault",
  data_type: "bool",
  severity: "alert",
  current_value: true,
  last_updated: "2026-09-01T00:00:00Z",
  last_changed: "2026-09-01T00:00:00Z",
  zone: null,
});

type Faults = { rows: FaultRow[]; loading: boolean; error: unknown };
const NO_FAULTS: Faults = { rows: [], loading: false, error: null };

function renderPage(
  doc: Synoptic = DOC,
  { faults = NO_FAULTS }: { faults?: Faults } = {},
) {
  const onNavigate = vi.fn();
  render(
    <MemoryRouter>
      <SynopticPage
        doc={doc}
        values={VALUES}
        knownSynoptics={new Set(["ecs", "west"])}
        synoptics={[]}
        pinned={null}
        onPin={vi.fn()}
        onNavigate={onNavigate}
        faults={faults}
        canWrite={false}
      />
    </MemoryRouter>,
  );
  return { onNavigate };
}

const card = () => document.querySelector<HTMLElement>("[data-plate-view]")!;
/** What the page shows before any scroll: the header and the plate. */
const firstScreen = () => card().parentElement!;
const pageRoot = () => firstScreen().parentElement!;
const headings = () =>
  [...pageRoot().querySelectorAll("h3")].map((h) => h.textContent);
const svg = () => card().querySelector<SVGSVGElement>("svg.bg-synoptic-plate")!;
const scale = () =>
  Number(
    /scale\((\S+)\)/.exec(
      svg().firstElementChild!.getAttribute("transform")!,
    )![1],
  );
const ring = (id: string) => card().querySelector(`[data-highlight='${id}']`);
const hoverWrap = (id: string) => card().querySelector(`[data-hover='${id}']`)!;
const navRow = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-nav-symbol='${id}']`)!;
const lit = () =>
  [...document.querySelectorAll("[data-nav-symbol][data-highlighted]")].map(
    (row) => row.getAttribute("data-nav-symbol"),
  );
const popover = () =>
  document.querySelector<HTMLElement>("[data-device-popover]");

beforeEach(() => {
  mockUseDeviceById.mockImplementation((id: string) => ({
    data: { id, name: id, type: "awhp", attributes: {} },
    isLoading: false,
    error: null,
  }));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  mockUseDeviceById.mockReset();
});

describe("SynopticPage", () => {
  describe("layout", () => {
    it("reads top to bottom: the header and the plate with its equipment list on the first screen, then the faults, the description last", () => {
      renderPage();
      // The first screen holds the header, then the plate, and nothing else.
      const [header, plate, ...rest] = [...firstScreen().children];
      expect(rest).toEqual([]);
      expect(header.querySelector("[data-page-title]")).not.toBeNull();
      expect(plate).toBe(card());
      expect(firstScreen().querySelector("h3")).toBeNull();
      // Then the sections, in that order, each under its own heading.
      expect(pageRoot().firstElementChild).toBe(firstScreen());
      expect(headings()).toEqual(["Défauts sur cette vue", "Description"]);
      expect(
        pageRoot().lastElementChild!.querySelector("[data-plate-description]"),
      ).not.toBeNull();
      // The equipment list stands in the plate's card, beside the drawing.
      expect(
        card().querySelector("nav[aria-label='Équipements']"),
      ).not.toBeNull();
    });

    it("gives the plate what the header leaves of the first screen, rather than a height of its own", () => {
      renderPage();
      expect(firstScreen().className).toContain("h-[calc(100dvh-8rem)]");
      expect(firstScreen().className).toContain("flex-col");
      expect(card().classList.contains("flex-1")).toBe(true);
      // Without it a flex child never shrinks below its content.
      expect(card().classList.contains("min-h-0")).toBe(true);
      expect(card().className).not.toContain("h-[40rem]");
    });

    it("writes the description once, at the foot of the page, and never under the title", () => {
      renderPage();
      const written = screen.getAllByText("Eau chaude sanitaire, aile est");
      expect(written).toHaveLength(1);
      expect(written[0].hasAttribute("data-plate-description")).toBe(true);
      expect(firstScreen().textContent).not.toContain(
        "Eau chaude sanitaire, aile est",
      );
    });

    it.each([
      ["no description", undefined],
      ["an empty description", ""],
      ["a null description", null],
    ])("has no description section for a plate with %s", (_, description) => {
      renderPage({ ...DOC, description } as Synoptic);
      expect(document.querySelector("[data-plate-description]")).toBeNull();
      expect(headings()).toEqual(["Défauts sur cette vue"]);
    });
  });

  describe("faults", () => {
    it.each([
      [
        "loading",
        { rows: [fault("PAC-03")], loading: true, error: null },
        { skeleton: true, text: null, badge: null, rows: 0 },
      ],
      [
        "failed",
        { rows: [], loading: false, error: "boom" },
        {
          skeleton: false,
          text: "Impossible de charger les défauts",
          badge: null,
          rows: 0,
        },
      ],
      [
        "empty",
        NO_FAULTS,
        {
          skeleton: false,
          text: "Aucun défaut actif.",
          badge: null,
          rows: 0,
        },
      ],
      [
        "listed",
        { rows: [fault("PAC-03"), fault("P-1")], loading: false, error: null },
        { skeleton: false, text: null, badge: "2 défauts", rows: 2 },
      ],
    ])("shows the faults %s in their section", (_, faults, expected) => {
      renderPage(DOC, { faults: faults as Faults });
      const section = pageRoot().children[1];
      expect(section.querySelector("h3")?.textContent).toBe(
        "Défauts sur cette vue",
      );
      expect(section.querySelector(".animate-pulse") !== null).toBe(
        expected.skeleton,
      );
      if (expected.text) expect(section.textContent).toContain(expected.text);
      expect(section.querySelectorAll("tbody tr")).toHaveLength(expected.rows);
      expect(
        document.querySelector("[data-fault-count]")?.textContent ?? null,
      ).toBe(expected.badge);
    });
  });

  describe("locating from the equipment list", () => {
    it("centres the symbol at 200 %, rings it, lights its row and opens its points when it is a device", () => {
      renderPage();
      expect(scale()).toBe(1);

      fireEvent.click(navRow("pac"));

      expect(scale()).toBe(2);
      expect(screen.getByText("200 %")).toBeInTheDocument();
      expect(ring("pac")).not.toBeNull();
      expect(lit()).toEqual(["pac"]);
      expect(popover()?.getAttribute("data-device-popover")).toBe("pac");
    });

    it.each([
      ["a tank that is no device", "b01"],
      ["a link to another plate", "to-west"],
    ])(
      "locates %s and rings it, with nothing to open and nowhere to go",
      (_, id) => {
        const { onNavigate } = renderPage();
        fireEvent.click(navRow(id));
        expect(scale()).toBe(2);
        expect(ring(id)).not.toBeNull();
        expect(popover()).toBeNull();
        expect(onNavigate).not.toHaveBeenCalled();
      },
    );
  });

  describe("the ring the plate and the list share", () => {
    it("lights the row of the symbol under the pointer on the plate, and only that row", () => {
      renderPage();
      expect(lit()).toEqual([]);
      fireEvent.pointerEnter(hoverWrap("b01"));
      expect(lit()).toEqual(["b01"]);
      expect(ring("b01")).not.toBeNull();
      fireEvent.pointerLeave(hoverWrap("b01"));
      expect(lit()).toEqual([]);
      expect(ring("b01")).toBeNull();
    });

    it("rings on the plate the row under the pointer or the keyboard focus", () => {
      renderPage();
      fireEvent.mouseEnter(navRow("pac"));
      expect(ring("pac")).not.toBeNull();
      expect(lit()).toEqual(["pac"]);
      fireEvent.mouseLeave(navRow("pac"));
      expect(ring("pac")).toBeNull();

      fireEvent.focus(navRow("to-west"));
      expect(ring("to-west")).not.toBeNull();
      fireEvent.blur(navRow("to-west"));
      expect(ring("to-west")).toBeNull();
    });
  });
});

describe("locating from the list", () => {
  it("keeps a device it located ringed once its points take the focus from the row", async () => {
    renderPage();
    await userEvent.click(navRow("pac"));
    expect(popover()).not.toBeNull();
    expect(document.activeElement).not.toBe(navRow("pac"));
    expect(ring("pac")).not.toBeNull();
  });

  it("keeps an equipment it located ringed once the pointer leaves its row, until another is located or hovered", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(navRow("b01"));
    await user.unhover(navRow("b01"));
    expect(ring("b01")).not.toBeNull();
    // Hovering another symbol rings that one while the pointer is on it.
    fireEvent.pointerEnter(hoverWrap("pac"));
    expect(ring("pac")).not.toBeNull();
    expect(ring("b01")).toBeNull();
    fireEvent.pointerLeave(hoverWrap("pac"));
    expect(ring("b01")).not.toBeNull();
    await user.click(navRow("to-west"));
    await user.unhover(navRow("to-west"));
    expect(ring("to-west")).not.toBeNull();
    expect(ring("b01")).toBeNull();
  });

  it("gives the focus back to the row once the points it opened are closed", async () => {
    renderPage();
    const user = userEvent.setup();
    navRow("pac").focus();
    await user.keyboard("{Enter}");
    expect(popover()).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(navRow("pac"));
  });
});
