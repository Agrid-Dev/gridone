import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AttributeSlot, Synoptic } from "@gridone/sdk";
import ecsEstPlate from "@/pages/sandbox/ecsEstPlate.json";
import { SILENT_TEXT, textWidth } from "./Chip";
import { PANEL_W } from "./Panel";
import { portPoint } from "./projection";
import { SynopticRenderer } from "./SynopticRenderer";
import { SynopticSymbol } from "./symbols/SynopticSymbol";
import type { SlotReading, SynopticValues } from "./values";

afterEach(cleanup);

const slot = (attribute: string): AttributeSlot => ({
  kind: "attribute",
  target: { devices: { ids: ["PAC-03"] }, attribute },
});

const live = (text: string, raw: SlotReading["raw"] = text): SlotReading => ({
  text,
  raw,
  stale: false,
  faulty: false,
});

const DOC: Synoptic = {
  id: "p",
  name: "plate",
  metadata: {},
  projection: "isometric",
  symbols: [
    {
      id: "pac",
      type: "heat_pump",
      placement: { kind: "cell", cell: { x: 0, y: 0 } },
      label: "PAC 03",
      device_id: "PAC-03",
      bindings: {
        state: slot("onoff_state"),
        fault: slot("general_fault"),
        supply_temp: slot("outlet_temperature"),
      },
    },
    {
      id: "b01",
      type: "tank",
      placement: { kind: "cell", cell: { x: 6, y: 0 } },
      label: "B01",
      bindings: { temperature: slot("temperature") },
    },
    {
      id: "col",
      type: "collector",
      placement: { kind: "cell", cell: { x: 3, y: 3 } },
      label: "COLLECTOR",
      props: { axis: "x", length: 3, ports: {} },
    },
    {
      id: "v-03",
      type: "valve_isolation",
      placement: { kind: "pipe", pipe: "branch", cell: { x: 5, y: 2 } },
      label: "V-03",
      bindings: { state: slot("valve_open") },
    },
    {
      id: "mystery",
      type: "not_a_type",
      placement: { kind: "cell", cell: { x: 9, y: 9 } },
    },
  ],
  pipes: [
    {
      id: "supply",
      fluid: "primary_supply",
      from: { kind: "port", symbol: "pac", port: "supply" },
      to: { kind: "port", symbol: "b01", port: "primary_in" },
      waypoints: [
        { x: 5, y: 1 },
        { x: 5, y: 0 },
      ],
      flow: slot("onoff_state"),
      tags: [
        { id: "tt-03", at: { x: 2, y: 1 }, label: "TT-03", value: slot("t") },
        { id: "lps", at: { x: 4, y: 1 }, label: "LPS" },
      ],
    },
    {
      id: "branch",
      fluid: "dhw",
      from: { kind: "pipe", pipe: "supply", cell: { x: 5, y: 1 } },
      to: { kind: "cell", cell: { x: 5, y: 3 } },
      waypoints: [],
      tags: [],
    },
  ],
  labels: [
    { id: "title", at: { x: -1, y: -2 }, text: "PLATE", role: "title" },
    {
      id: "note",
      at: { x: 0, y: 5.5 },
      text: "rooms",
      role: "note",
      value: { kind: "text", text: "104" },
    },
  ],
};

const VALUES: SynopticValues = {
  slots: {
    "symbol.pac.state": live("MARCHE", true),
    "symbol.pac.fault": live("NORMAL", false),
    "symbol.pac.supply_temp": { ...live("52.4 °C", 52.4), stale: true },
    "symbol.b01.temperature": live("55.0 °C", 55),
    "symbol.v-03.state": live("FERMÉE", false),
    "pipe.supply.flow": live("MARCHE", true),
    "tag.tt-03": { ...live("51.9 °C", 51.9), faulty: true },
    "label.note": live("104", null),
  },
  faultyDevices: { "PAC-03": true },
};

function draw(doc = DOC, values?: SynopticValues) {
  const { container } = render(<SynopticRenderer doc={doc} values={values} />);
  return container;
}

const q = (c: Element, selector: string) => [...c.querySelectorAll(selector)];

describe("SynopticRenderer", () => {
  it("places every symbol, cuts each run per cell and draws the labels", () => {
    const c = draw();
    // supply: (1,1) along to (5,1), up to (5,0), on to (6,0) is seven cells,
    // the two port cells as stubs under their bodies; branch is three.
    expect(q(c, "path.stroke-fluid-primary-supply")).toHaveLength(7);
    expect(q(c, "path.stroke-fluid-dhw")).toHaveLength(3);
    // One arrow, at the port the supply ends on; the branch ends at a free
    // cell, where its last piece has no length left to carry a head.
    expect(q(c, "polygon.fill-fluid-primary-supply")).toHaveLength(1);
    expect(q(c, "polygon.fill-fluid-dhw")).toHaveLength(0);
    // The tee disc takes the trunk's colour.
    expect(q(c, "circle[data-tee].fill-fluid-primary-supply")).toHaveLength(1);
    expect(q(c, "[data-unknown-symbol='not_a_type']")).toHaveLength(1);
    expect(q(c, "[data-label='title']")[0].textContent).toBe("PLATE");
    expect(q(c, "[data-label='note'] [data-chip]")[0].textContent).toContain(
      "104",
    );
    expect(c.querySelector("text.text-\\[18px\\]")?.textContent).toBe("PLATE");
  });

  it("is silent everywhere without values", () => {
    const c = draw();
    expect(q(c, "[data-chip='silent']")).toHaveLength(3);
    // The label's literal needs no device, so it reads live regardless.
    expect(q(c, "[data-chip='live']")).toHaveLength(1);
    expect(q(c, "[data-panel] [data-row='silent']")).toHaveLength(3);
    expect(q(c, "[data-tag='tt-03'] text")[1].textContent).toBe(SILENT_TEXT);
    expect(q(c, ".stroke-status-error")).toHaveLength(1); // the unknown cell
  });

  it("shows the readings: a panel for many slots, a chip for one", () => {
    const c = draw(DOC, VALUES);
    const panel = c.querySelector("[data-panel='PAC 03']")!;
    const rows = q(panel, "[data-row]");
    expect(rows.map((r) => r.getAttribute("data-row"))).toEqual([
      "live",
      "live",
      "stale",
    ]);
    expect(rows.map((r) => r.querySelectorAll("text")[0].textContent)).toEqual([
      "state",
      "fault",
      "supply temp",
    ]);
    expect(rows[2].querySelectorAll("text")[1].textContent).toBe("52.4 °C");
    expect(q(c, "[data-panel]")).toHaveLength(1);
    // Tank, valve and the tag: one chip each, plus the label's.
    expect(q(c, "[data-chip='live']")).toHaveLength(4);
    expect(q(c, "[data-tag='tt-03'] [data-chip] text")[1].textContent).toBe(
      "51.9 °C",
    );
  });

  it("marks the faulty device on its symbol, its panel and the tag reading it", () => {
    const c = draw(DOC, VALUES);
    const panel = c.querySelector("[data-panel='PAC 03']")!;
    expect(
      panel.querySelector("rect")?.classList.contains("stroke-status-error"),
    ).toBe(true);
    expect(q(panel, "circle.fill-status-error")).toHaveLength(1);
    expect(
      c
        .querySelector("[data-tag='tt-03'] rect")
        ?.classList.contains("stroke-status-error"),
    ).toBe(true);
    // The heat pump's silhouette outline and badge, the panel, the tag chip.
    expect(q(c, "polygon.stroke-status-error")).toHaveLength(2);
    expect(c.querySelector("[data-panel='PAC 03'] text")?.textContent).toBe(
      "PAC 03",
    );
  });

  it("animates a run whose flow is on and dims one whose flow is off", () => {
    const on = draw(DOC, VALUES);
    expect(q(on, "path.animate-flow")).toHaveLength(7);
    const off = draw(DOC, {
      ...VALUES,
      slots: { ...VALUES.slots, "pipe.supply.flow": live("ARRÊT", false) },
    });
    expect(q(off, "path.animate-flow")).toHaveLength(0);
    expect(
      q(off, "path.stroke-fluid-primary-supply").map((p) =>
        p.parentElement?.getAttribute("opacity"),
      ),
    ).toEqual(Array(7).fill("0.45"));
    // A bound flow with no reading yet is static, not dimmed.
    const silent = draw(DOC);
    expect(q(silent, "path.animate-flow")).toHaveLength(0);
    expect(
      q(
        silent,
        "path.stroke-fluid-primary-supply",
      )[0].parentElement?.getAttribute("opacity"),
    ).toBe("1");
  });

  it("paints an inline symbol over the run it sits on, turned with it", () => {
    const c = draw(DOC, VALUES);
    // The closed valve drawn by the kit for a run along +y, as the branch is.
    const { container } = render(
      <svg>
        <SynopticSymbol
          type="valve_isolation"
          projection="isometric"
          origin={{ x: 5, y: 2 }}
          state="off"
          direction={{ x: 0, y: 1 }}
        />
      </svg>,
    );
    const expected = container
      .querySelector("polygon.fill-synoptic-stroke")!
      .getAttribute("points");
    const closed = q(c, "polygon.fill-synoptic-stroke").find(
      (p) => p.getAttribute("points") === expected,
    );
    expect(closed).toBeDefined();
    // Its own cell's piece of the run is painted before it.
    const under = q(c, "path.stroke-fluid-dhw")[1];
    expect(
      under.compareDocumentPosition(closed!) &
        under.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("paints a run's stub under the body it enters, and the arrow outside it", () => {
    const c = draw();
    const body = c.querySelector("polygon.fill-synoptic-body-x")!;
    const under = q(c, "path.stroke-fluid-primary-supply").filter(
      (p) => p.compareDocumentPosition(body) & p.DOCUMENT_POSITION_FOLLOWING,
    );
    // Only the stub inside the heat pump's far cell precedes its body.
    expect(under).toHaveLength(1);
    // The arrow sits on the piece before the tank's stub, tip at the face
    // the run enters the tank cell through.
    const tip = portPoint("isometric", { x: 6, y: 0 }, "-x");
    const arrow = c.querySelector("polygon.fill-fluid-primary-supply")!;
    expect(arrow.getAttribute("points")!.startsWith(`${tip.x},${tip.y} `)).toBe(
      true,
    );
  });

  it("frames the drawn extent in the viewBox", () => {
    const c = draw();
    const [x, y, w, h] = c
      .querySelector("svg")!
      .getAttribute("viewBox")!
      .split(" ")
      .map(Number);
    expect([x, y]).toEqual([0, 0]);
    expect(w).toBeGreaterThan(400);
    expect(h).toBeGreaterThan(200);
    const bare = draw({ ...DOC, symbols: [], pipes: [], labels: [] });
    expect(bare.querySelector("svg")!.getAttribute("viewBox")).toBe(
      "0 0 120 120",
    );
  });

  it("counts a label's text and a symbol's panel into the extent", () => {
    const title = draw({
      ...DOC,
      symbols: [],
      pipes: [],
      labels: [DOC.labels![0]],
    });
    // 18 px semibold, 5 glyphs, 60 px of margin each side.
    expect(title.querySelector("svg")!.getAttribute("viewBox")).toBe(
      `0 0 ${120 + textWidth("PLATE", 18)} 120`,
    );
    const panel = draw({
      ...DOC,
      symbols: [DOC.symbols![0]],
      pipes: [],
      labels: [],
    });
    // The 2 x 2 footprint spans 160 px; the 164 px panel centred on it wins.
    const [, , w] = panel
      .querySelector("svg")!
      .getAttribute("viewBox")!
      .split(" ")
      .map(Number);
    expect(w).toBe(120 + PANEL_W);
  });

  it("reads a label role this build does not know as a note", () => {
    const c = draw({
      ...DOC,
      symbols: [],
      pipes: [],
      labels: [{ ...DOC.labels![0], role: "legend" as "note" }],
    });
    const text = c.querySelector("[data-label='legend'] text")!;
    expect(text.textContent).toBe("PLATE");
    expect(text.classList.contains("text-[11px]")).toBe(true);
  });

  it("degrades a collector without a bar to the unknown cell", () => {
    const c = draw({
      ...DOC,
      symbols: [{ ...DOC.symbols![2], props: {} }],
      pipes: [],
      labels: [],
    });
    expect(q(c, "[data-unknown-symbol='collector']")).toHaveLength(1);
  });

  it("renders the reference plate whole", () => {
    const plate = { ...(ecsEstPlate as Synoptic), id: "ecs", metadata: {} };
    const c = draw(plate);
    expect(q(c, "[data-unknown-symbol]")).toHaveLength(0);
    expect(q(c, "[data-panel]")).toHaveLength(2);
    expect(q(c, "[data-tag]")).toHaveLength(5);
    expect(q(c, "circle[data-tee]")).toHaveLength(5);
    expect(q(c, "[data-label]")).toHaveLength(5);
    expect(q(c, "polygon.fill-fluid-dhw").length).toBeGreaterThan(0);
  });
});
