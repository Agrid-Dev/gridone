import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AttributeSlot, PipeElement, Synoptic } from "@gridone/sdk";
import ecsEstPlate from "@/pages/sandbox/ecsEstPlate.json";
import { CHIP_H, SILENT_TEXT } from "./Chip";
import { PANEL_W, panelHeight } from "./Panel";
import { portPoint, project } from "./projection";
import { SynopticRenderer } from "./SynopticRenderer";
import { SynopticSymbol } from "./symbols/SynopticSymbol";
import { textWidth } from "./text";
import type { SlotReading, SynopticValues } from "./values";

afterEach(cleanup);

const slot = (attribute: string): AttributeSlot => ({
  kind: "attribute",
  target: { devices: { ids: ["PAC-03"] }, attribute },
});

const live = (
  text: string,
  raw: SlotReading["raw"] = text,
  unit: string | null = null,
): SlotReading => ({
  text,
  unit,
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
    "symbol.pac.supply_temp": { ...live("52.4", 52.4, "°C"), stale: true },
    "symbol.b01.temperature": live("55.0", 55, "°C"),
    "symbol.v-03.state": live("FERMÉE", false),
    "pipe.supply.flow": live("MARCHE", true),
    "tag.tt-03": { ...live("51.9", 51.9, "°C"), faulty: true },
    "label.note": live("104", null),
  },
  faultyDevices: { "PAC-03": true },
};

function draw(doc = DOC, values?: SynopticValues) {
  const { container } = render(<SynopticRenderer doc={doc} values={values} />);
  return container;
}

const q = (c: Element, selector: string) => [...c.querySelectorAll(selector)];

type TestBox = { x0: number; y0: number; x1: number; y1: number };
const box = (r: Element): TestBox => ({
  x0: Number(r.getAttribute("x")),
  y0: Number(r.getAttribute("y")),
  x1: Number(r.getAttribute("x")) + Number(r.getAttribute("width")),
  y1: Number(r.getAttribute("y")) + Number(r.getAttribute("height")),
});
const apart = (a: TestBox, b: TestBox) =>
  a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
/** Bounding boxes of every run piece, read off the casing paths. */
const casings = (c: Element): TestBox[] =>
  q(c, "path[data-casing]").map((path) => {
    const pts = path
      .getAttribute("d")!
      .match(/-?[\d.]+ -?[\d.]+/g)!
      .map((p) => p.split(" ").map(Number));
    return {
      x0: Math.min(...pts.map((p) => p[0])),
      y0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])),
      y1: Math.max(...pts.map((p) => p[1])),
    };
  });

describe("SynopticRenderer", () => {
  it("places every symbol, cuts each run per cell and draws the labels", () => {
    const c = draw();
    // supply: (1,1) along to (5,1), up to (5,0), on to (6,0) is seven cells,
    // the two port cells as stubs under their bodies; branch is three.
    expect(q(c, "path.stroke-fluid-primary-supply")).toHaveLength(7);
    expect(q(c, "path.stroke-fluid-dhw")).toHaveLength(3);
    // One arrow per pipe at its `to` end: on the port the supply ends on,
    // and at the centre of the free cell the branch ends in.
    expect(q(c, "polygon.fill-fluid-primary-supply")).toHaveLength(1);
    const branchTip = project("isometric", 5.5, 3.5, 0.4);
    expect(
      q(c, "polygon.fill-fluid-dhw")[0]
        .getAttribute("points")!
        .startsWith(`${branchTip.x},${branchTip.y} `),
    ).toBe(true);
    // The tee disc takes the trunk's colour.
    expect(q(c, "circle[data-tee].fill-fluid-primary-supply")).toHaveLength(1);
    expect(q(c, "[data-unknown-symbol='not_a_type']")).toHaveLength(1);
    expect(q(c, "[data-label='title']")[0].textContent).toBe("PLATE");
    expect(q(c, "[data-label='note'] [data-chip]")[0].textContent).toContain(
      "104",
    );
    expect(c.querySelector("text[font-size='18']")?.textContent).toBe("PLATE");
  });

  it("is silent everywhere without values", () => {
    const c = draw();
    expect(q(c, "[data-chip='silent']")).toHaveLength(3);
    // The label's literal needs no device, so it reads live regardless.
    expect(q(c, "[data-chip='live']")).toHaveLength(1);
    expect(q(c, "[data-panel] [data-row='silent']")).toHaveLength(3);
    // TT-03 hangs below its run: the chip's dash comes before its caption.
    expect(q(c, "[data-tag='tt-03'] text")[0].textContent).toBe(SILENT_TEXT);
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
    expect(rows[2].querySelectorAll("text")[1].textContent).toBe("52.4");
    expect(rows[2].querySelector("[data-unit]")?.textContent).toBe("°C");
    expect(q(c, "[data-panel]")).toHaveLength(1);
    // Tank, valve and the tag: one chip each, plus the label's.
    expect(q(c, "[data-chip='live']")).toHaveLength(4);
    const tagTexts = q(c, "[data-tag='tt-03'] [data-chip] text");
    expect(tagTexts.map((t) => t.textContent)).toEqual(["51.9", "°C"]);
  });

  it("hangs a single reading under the symbol's label and joins a panel to its body", () => {
    const c = draw(DOC, VALUES);
    const label = q(c, "text").find((t) => t.textContent === "B01")!;
    const chip = c.querySelector("[data-chip='live'] rect")!;
    const chips = q(c, "[data-chip]").map((g) => g.querySelector("rect")!);
    // The tank's chip: top edge under the label's baseline, centred on it.
    const tank = chips.find(
      (r) =>
        Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2 ===
        Number(label.getAttribute("x")),
    )!;
    expect(tank).toBeDefined();
    expect(Number(tank.getAttribute("y"))).toBeGreaterThan(
      Number(label.getAttribute("y")),
    );
    expect(chip).toBeDefined();
    // The panel leads to the heat pump with a 1 px muted leader.
    const leader = c.querySelector("[data-leader]")!;
    expect(leader.getAttribute("stroke-width")).toBe("1");
    expect(leader.classList.contains("stroke-muted-foreground")).toBe(true);
  });

  it("places a panel clear of bodies and other panels, above first", () => {
    const twin = (id: string, x: number, y: number) => ({
      ...DOC.symbols![0],
      id,
      label: id,
      placement: { kind: "cell" as const, cell: { x, y } },
    });
    // Two heat pumps four cells apart along y, as the reference plate has:
    // both panels above their labels would be 80 px apart for 100 px of
    // panel, so the second one has to move.
    const c = draw(
      {
        ...DOC,
        symbols: [twin("a", 0, 0), twin("b", 0, 4)],
        pipes: [],
        labels: [],
      },
      VALUES,
    );
    const frame = (id: string) => {
      const r = c.querySelector(`[data-panel='${id}'] rect`)!;
      const x = Number(r.getAttribute("x"));
      const y = Number(r.getAttribute("y"));
      return { x0: x, y0: y, x1: x + PANEL_W, y1: y + panelHeight(3) };
    };
    const a = frame("a");
    const b = frame("b");
    const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
    expect(apart).toBe(true);
    // The first panel takes the spot above its label (the panel's own
    // title reads the same, so look outside the panels).
    const labelA = q(c, "text").find(
      (t) => t.textContent === "a" && !t.closest("[data-panel]"),
    )!;
    expect(a.y1).toBeLessThan(Number(labelA.getAttribute("y")));
    expect((a.x0 + a.x1) / 2).toBe(Number(labelA.getAttribute("x")));
  });

  it("hangs a tag below its run when a body stands where the chip would rise", () => {
    const c = draw(DOC, VALUES);
    // TT-03 at (2,1) rises over the heat pump on (1,0)..(1,1): it hangs below.
    const tt = c.querySelector("[data-tag='tt-03']")!;
    expect(tt.getAttribute("data-side")).toBe("below");
    const on = project("isometric", 2.5, 1.5, 0.4);
    const rect = tt.querySelector("rect")!;
    expect(Number(rect.getAttribute("y"))).toBeGreaterThan(on.y);
    // Its caption sits under the chip, and the leader reaches the chip's top.
    const caption = q(tt, "text").find((t) => t.textContent === "TT-03")!;
    expect(Number(caption.getAttribute("y"))).toBeGreaterThan(
      Number(rect.getAttribute("y")) + CHIP_H,
    );
    const leader = tt.querySelector("line")!;
    expect(Number(leader.getAttribute("y1"))).toBe(
      Number(rect.getAttribute("y")),
    );
    // LPS at (4,1) has open cells behind it and stays above.
    expect(c.querySelector("[data-tag='lps']")?.getAttribute("data-side")).toBe(
      "above",
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

  it("animates a run only on a live flow reading of true", () => {
    const on = draw(DOC, VALUES);
    expect(q(on, "path.animate-flow")).toHaveLength(7);
    const flow = (reading: SlotReading) =>
      q(
        draw(DOC, {
          ...VALUES,
          slots: { ...VALUES.slots, "pipe.supply.flow": reading },
        }),
        "path.animate-flow",
      );
    expect(flow(live("ARRÊT", false))).toHaveLength(0);
    // A stale MARCHE is not a running pump.
    expect(flow({ ...live("MARCHE", true), stale: true })).toHaveLength(0);
    // A bound flow with no reading yet is static.
    expect(q(draw(DOC), "path.animate-flow")).toHaveLength(0);
  });

  it("lights the LED from an int or string state the labels name, not only a boolean", () => {
    const lit = (raw: SlotReading["raw"]) =>
      q(
        draw(DOC, {
          ...VALUES,
          slots: { ...VALUES.slots, "symbol.pac.state": live("MARCHE", raw) },
          faultyDevices: {},
        }),
        "circle.fill-status-ok",
      ).length;
    // The symbol's LED and the panel's.
    expect(lit(true)).toBe(2);
    expect(lit(1)).toBe(2);
    expect(lit("1")).toBe(2);
    expect(lit("on")).toBe(2);
    expect(lit(0)).toBe(0);
    expect(lit("auto")).toBe(0);
  });

  it("places a single chip clear of its neighbours too", () => {
    // Two tanks at one-cell pitch: their label points are 40 px apart, a
    // chip is at least 36 px wide, so a blind placement would overlap.
    const tank = (id: string, x: number) => ({
      ...DOC.symbols![1],
      id,
      label: id,
      placement: { kind: "cell" as const, cell: { x, y: 0 } },
    });
    const c = draw(
      {
        ...DOC,
        symbols: [tank("a", 10), tank("b", 11)],
        pipes: [],
        labels: [],
      },
      {
        slots: {
          "symbol.a.temperature": live("55.0", 55, "°C"),
          "symbol.b.temperature": live("54.0", 54, "°C"),
        },
        faultyDevices: {},
      },
    );
    const [a, b] = q(c, "[data-chip] rect").map((r) => ({
      x0: Number(r.getAttribute("x")),
      y0: Number(r.getAttribute("y")),
      x1: Number(r.getAttribute("x")) + Number(r.getAttribute("width")),
      y1: Number(r.getAttribute("y")) + Number(r.getAttribute("height")),
    }));
    expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0).toBe(
      true,
    );
  });

  it("hangs a tag clear of a parallel run one row behind, and of a neighbour's label", () => {
    // Two free runs along +x one row apart: a chip lifted 44 px from the
    // front run is centred on the back one, 40 px up on screen.
    const run = (id: string, y: number, tags: PipeElement["tags"] = []) => ({
      id,
      fluid: "dhw" as const,
      from: { kind: "cell" as const, cell: { x: 0, y } },
      to: { kind: "cell" as const, cell: { x: 6, y } },
      waypoints: [],
      tags,
    });
    const c = draw(
      {
        ...DOC,
        symbols: [],
        labels: [],
        pipes: [
          run("back", 0),
          run("front", 1, [
            { id: "tt", at: { x: 3, y: 1 }, label: "TT", value: slot("t") },
          ]),
        ],
      },
      { slots: { "tag.tt": live("52.4", 52.4, "°C") }, faultyDevices: {} },
    );
    const chip = box(c.querySelector("[data-tag='tt'] rect")!);
    for (const casing of casings(c)) expect(apart(chip, casing)).toBe(true);
    // The same tag beside an inline pump: the pump's label and LED keep
    // their room, so the chip does not cover them.
    const pumped = draw(
      {
        ...DOC,
        labels: [],
        symbols: [
          {
            id: "p",
            type: "pump",
            placement: { kind: "pipe", pipe: "front", cell: { x: 2, y: 1 } },
            label: "P-01",
            bindings: { state: slot("onoff_state") },
          },
        ],
        pipes: [
          run("front", 1, [
            { id: "tt", at: { x: 3, y: 1 }, label: "TT", value: slot("t") },
          ]),
        ],
      },
      {
        slots: {
          "tag.tt": live("52.4", 52.4, "°C"),
          "symbol.p.state": live("MARCHE", true),
        },
        faultyDevices: {},
      },
    );
    const led = pumped.querySelector("circle.fill-status-ok")!;
    const ledBox = {
      x0: Number(led.getAttribute("cx")) - 4,
      y0: Number(led.getAttribute("cy")) - 4,
      x1: Number(led.getAttribute("cx")) + 4,
      y1: Number(led.getAttribute("cy")) + 4,
    };
    expect(
      apart(box(pumped.querySelector("[data-tag='tt'] rect")!), ledBox),
    ).toBe(true);
  });

  it("ends every panel leader on a drawn corner of its body", () => {
    const c = draw(
      { ...(ecsEstPlate as Synoptic), id: "ecs", metadata: {} },
      VALUES,
    );
    const vertices = q(c, "polygon[class*='fill-synoptic-body']").flatMap((p) =>
      p
        .getAttribute("points")!
        .split(" ")
        .map((pt) => pt.split(",").map(Number)),
    );
    // A panel above its label leads to the label; any other spot leads to
    // a drawn corner of the body, never to a bounding-box corner in the void.
    const labels = q(c, "text").map((t) => [
      Number(t.getAttribute("x")),
      Number(t.getAttribute("y")) - 4,
    ]);
    const leaders = q(c, "[data-leader]");
    expect(leaders).toHaveLength(2);
    const ends = leaders.map((leader) => [
      Number(leader.getAttribute("x2")),
      Number(leader.getAttribute("y2")),
    ]);
    const near = (pts: number[][], end: number[]) =>
      pts.some(([x, y]) => Math.hypot(x - end[0], y - end[1]) < 0.5);
    for (const end of ends) {
      expect(near(vertices, end) || near(labels, end)).toBe(true);
    }
    // PAC 04 takes a corner spot on the reference plate: its leader is the
    // one that must land on the body.
    expect(ends.some((end) => near(vertices, end))).toBe(true);
  });

  it("lights no LED on a stale state reading", () => {
    const c = draw(DOC, {
      ...VALUES,
      slots: {
        ...VALUES.slots,
        "symbol.pac.state": { ...live("MARCHE", true), stale: true },
      },
      faultyDevices: {},
    });
    const panel = c.querySelector("[data-panel='PAC 03']")!;
    expect(panel.querySelector("circle:not([data-row] circle)")).toBeNull();
    expect(q(c, "circle.fill-status-ok")).toHaveLength(0);
    // The row itself still says what it holds, muted with the disc.
    expect(panel.querySelector("[data-row='stale']")).not.toBeNull();
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

  it("frames a rotated body where it is drawn", () => {
    const pump = (rotation: 0 | 1 | 2 | 3) =>
      draw({
        ...DOC,
        symbols: [
          {
            ...DOC.symbols![0],
            bindings: {},
            placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation },
          },
        ],
        pipes: [],
        labels: [],
      });
    const size = (c: Element) =>
      c.querySelector("svg")!.getAttribute("viewBox")!.split(" ").map(Number);
    // A quarter turn of a square body keeps the same extent; the frame
    // follows the body rather than the unrotated footprint.
    expect(size(pump(1))).toEqual(size(pump(0)));
    expect(size(pump(2))).toEqual(size(pump(0)));
    const turned = pump(2);
    const body = turned.querySelector("polygon.fill-synoptic-body")!;
    const ys = body
      .getAttribute("points")!
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    const [, , , h] = size(turned);
    // The plate group, inside the canvas's own, shifts the extent's corner
    // to the margin.
    const shift = Number(
      turned
        .querySelectorAll("g[transform^='translate']")[1]
        .getAttribute("transform")!
        .match(/translate\([-\d.]+ ([-\d.]+)\)/)![1],
    );
    expect(Math.min(...ys) + shift).toBeGreaterThanOrEqual(60);
    expect(Math.max(...ys) + shift).toBeLessThanOrEqual(h - 60);
  });

  it("counts a label's text and a symbol's panel into the extent", () => {
    const title = draw({
      ...DOC,
      symbols: [],
      pipes: [],
      labels: [DOC.labels![0]],
    });
    // 18 px semibold, 5 glyphs wide and one line above the baseline, 60 px
    // of margin each side.
    expect(title.querySelector("svg")!.getAttribute("viewBox")).toBe(
      `0 0 ${120 + textWidth("PLATE", 18)} ${120 + 18}`,
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
    expect(text.getAttribute("font-size")).toBe("11");
    expect(text.getAttribute("font-weight")).toBe("400");
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
    // The PAC tags hang below their runs, clear of the bodies beside them;
    // TT-06 hangs below because the supply run passes where its chip would
    // rise.
    expect(
      q(c, "[data-tag][data-side='below']").map((t) =>
        t.getAttribute("data-tag"),
      ),
    ).toEqual(["tt-03", "tt-04", "tt-06"]);
    // The two panels do not overlap each other, and no run is drawn
    // across either or across a tag: readouts clear the runs as well as
    // the bodies.
    const frames = q(c, "[data-panel] > rect").map(box);
    expect(apart(frames[0], frames[1])).toBe(true);
    const runs = casings(c);
    for (const frame of frames) {
      expect(runs.every((run) => apart(frame, run))).toBe(true);
    }
    for (const chip of q(c, "[data-tag] rect").map(box)) {
      expect(runs.every((run) => apart(chip, run))).toBe(true);
    }
  });
});
