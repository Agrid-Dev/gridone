import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRef } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AttributeSlot,
  LabelElement,
  PipeElement,
  Projection,
  SymbolElement,
  Synoptic,
} from "@gridone/sdk";
import { CHIP_H, chipWidth, SILENT_TEXT } from "./Chip";
import { PANEL_W, panelHeight } from "./Panel";
import {
  DEFAULT_PROJECTION,
  PIPE_AXIS_Z,
  portPoint,
  project,
} from "./projection";
import {
  SynopticRenderer,
  symbolBox,
  type PlateHandle,
} from "./SynopticRenderer";
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
  devices: { "PAC-03": { faulty: true, severity: null } },
};

/** The committed plates as the API would store them, read from the spec so
 *  the customer-bound documents live in docs/ and on the instance, never in
 *  the bundle. Resolved from this file, so the runner's working directory
 *  is moot. */
const PLATES_DIR = resolve(
  import.meta.dirname,
  "../../../../../docs/specs/synoptic",
);
const plate = (name: string): Synoptic => ({
  ...JSON.parse(readFileSync(resolve(PLATES_DIR, `${name}.json`), "utf8")),
  id: name,
  metadata: {},
});
/** What the renderer decides on each committed plate: tees (a disc at every
 *  branch point), panels (a symbol with several bound slots) and chips
 *  (every single reading, on a tag, a symbol or a caption). What the
 *  document says (tags and their literals, fluids, labels) is read from the
 *  plate under test. The bays share the template and differ in their tees:
 *  the second PAC's return off the return loop on both, the column-3 feed on
 *  Ouest. */
const ECS_BAY = { panels: 3, chips: 4 };
const PLATES: Record<string, { tees: number; panels: number; chips: number }> =
  {
    "ecs-est": { ...ECS_BAY, tees: 1 },
    "ecs-ouest": { ...ECS_BAY, tees: 2 },
    "production-chaud": { tees: 14, panels: 4, chips: 35 },
    "production-froid": { tees: 6, panels: 2, chips: 21 },
  };
const PLATE_CASES = Object.entries(PLATES);

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
const pairwiseApart = (boxes: TestBox[]) =>
  boxes.forEach((a, i) =>
    boxes.slice(i + 1).forEach((b) => expect(apart(a, b)).toBe(true)),
  );
/** A free run along +x on row `y`, from x = 0. */
const freeRun = (
  id: string,
  y: number,
  tags: PipeElement["tags"] = [],
  length = 6,
): PipeElement => ({
  id,
  fluid: "dhw",
  from: { kind: "cell", cell: { x: 0, y } },
  to: { kind: "cell", cell: { x: length, y } },
  waypoints: [],
  tags,
});
type Seg = [[number, number], [number, number]];
/** Whether a box stays off a run: no point of the run's casing, 5 px to
 *  either side of the line it draws, inside the box. Sampled along the
 *  segment, independently of how the renderer decides it. */
const clearOfRun = (box: TestBox, [a, b]: Seg, half = 5) => {
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t;
    const dx = Math.max(box.x0 - x, 0, x - box.x1);
    const dy = Math.max(box.y0 - y, 0, y - box.y1);
    if (Math.hypot(dx, dy) < half) return false;
  }
  return true;
};
/** Straight segments of every run piece, read off the casing paths (a
 *  rounded corner reads as its two straight halves). */
const casingSegments = (c: Element): Seg[] =>
  q(c, "path[data-casing]").flatMap((path) => {
    const pts = path
      .getAttribute("d")!
      .match(/-?[\d.]+ -?[\d.]+/g)!
      .map((p) => p.split(" ").map(Number) as [number, number]);
    return pts.slice(1).map((b, i) => [pts[i], b] as Seg);
  });
/** How far, in px, `b` lies along `a` on the same line: two runs drawn one
 *  over the other, not merely crossing or meeting at a point. */
const collinearOverlap = ([a0, a1]: Seg, [b0, b1]: Seg) => {
  const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
  if (len < 1) return 0;
  const u = [(a1[0] - a0[0]) / len, (a1[1] - a0[1]) / len];
  const off = (p: [number, number]) =>
    Math.abs(u[0] * (p[1] - a0[1]) - u[1] * (p[0] - a0[0]));
  if (off(b0) > 0.5 || off(b1) > 0.5) return 0;
  const t = (p: [number, number]) =>
    u[0] * (p[0] - a0[0]) + u[1] * (p[1] - a0[1]);
  const [t0, t1] = [t(b0), t(b1)].sort((x, y) => x - y);
  return Math.min(t1, len) - Math.max(t0, 0);
};
/** The box an 11 px label's text takes, read off the text as drawn, its
 *  anchor deciding which way it runs from `x`. */
const labelBox = (t: Element): TestBox => {
  const x = Number(t.getAttribute("x"));
  const y = Number(t.getAttribute("y"));
  const w = textWidth(t.textContent ?? "", 11);
  const anchor = t.getAttribute("text-anchor") ?? "start";
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return { x0, y0: y - 11, x1: x0 + w, y1: y };
};
/** Whether a point lies in a box, a pixel of tolerance either way. */
const within = (p: { x: number; y: number }, b: TestBox) =>
  p.x >= b.x0 - 1 && p.x <= b.x1 + 1 && p.y >= b.y0 - 1 && p.y <= b.y1 + 1;

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
    // The label's literal needs no device: it is a note, never live.
    expect(q(c, "[data-chip='note']")).toHaveLength(1);
    expect(q(c, "[data-chip='live']")).toHaveLength(0);
    expect(q(c, "[data-panel] [data-row='silent']")).toHaveLength(3);
    // TT-03 shows its caption and, in the chip, the silent dash.
    expect(q(c, "[data-tag='tt-03'] text").map((t) => t.textContent)).toEqual(
      expect.arrayContaining(["TT-03", SILENT_TEXT]),
    );
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
    // Tank, valve and the tag: one live chip each; the label's is a note.
    expect(q(c, "[data-chip='live']")).toHaveLength(3);
    expect(q(c, "[data-chip='note']")).toHaveLength(1);
    // The value and its unit close the chip; the caption may precede them.
    const tagTexts = q(c, "[data-tag='tt-03'] [data-chip] text");
    expect(tagTexts.map((t) => t.textContent).slice(-2)).toEqual([
      "51.9",
      "°C",
    ]);
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
    // Hanging under its label, the chip needs no leader.
    expect(c.querySelector("[data-readout='b01'] [data-leader]")).toBeNull();
    // The panel leads to the heat pump with a 1 px muted leader.
    const leader = c.querySelector("[data-leader='panel']")!;
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
    // The branch and the collector under the run would take the spots
    // below it, and the title would push the heat pump's panel beside the
    // body, over the spot above LPS; without them the preferred side is
    // the one that wins.
    const c = draw(
      {
        ...DOC,
        symbols: DOC.symbols!.slice(0, 2),
        pipes: DOC.pipes!.slice(0, 1),
        labels: [],
      },
      VALUES,
    );
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

  it("never animates a run, whatever its flow reads: the machine shows the state", () => {
    const flow = (reading: SlotReading) =>
      q(
        draw(DOC, {
          ...VALUES,
          slots: { ...VALUES.slots, "pipe.supply.flow": reading },
        }),
        "path.animate-flow",
      );
    expect(flow(live("MARCHE", true))).toHaveLength(0);
    expect(flow(live("ARRÊT", false))).toHaveLength(0);
    expect(q(draw(DOC), "path.animate-flow")).toHaveLength(0);
    // The running heat pump turns its fan instead.
    expect(q(draw(DOC, VALUES), "[data-fan='on']")).toHaveLength(0);
    expect(
      q(draw(DOC, { ...VALUES, devices: {} }), "[data-fan='on']"),
    ).toHaveLength(1);
  });

  it("lights the LED from an int or string state the labels name, not only a boolean", () => {
    const lit = (raw: SlotReading["raw"]) => {
      const c = draw(DOC, {
        ...VALUES,
        slots: { ...VALUES.slots, "symbol.pac.state": live("MARCHE", raw) },
        devices: {},
      });
      // The panel's LED, and the fan of the machine itself.
      return [
        q(c, "[data-panel] circle.fill-status-ok").length,
        q(c, "[data-fan='on']").length,
      ];
    };
    expect(lit(true)).toEqual([1, 1]);
    expect(lit(1)).toEqual([1, 1]);
    expect(lit("1")).toEqual([1, 1]);
    expect(lit("on")).toEqual([1, 1]);
    expect(lit(0)).toEqual([0, 0]);
    expect(lit("auto")).toEqual([0, 0]);
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
        devices: {},
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

  it("keeps a collector bar's empty bounding box out of a tag's way", () => {
    // A bar drawn across the plate spans a bounding box that is mostly
    // empty plate: taken whole as an obstacle it forbade every readout
    // under it, and a tag with a run one row behind fell back onto that
    // run. The bar stands as one box per cell instead, so the tag hangs
    // below its run, where the bar's cells are not.
    const c = draw(
      {
        ...DOC,
        labels: [],
        symbols: [
          {
            id: "bar",
            type: "collector",
            placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation: 0 },
            props: {
              axis: "x",
              length: 12,
              ports: { in_1: { offset: 0, side: "-x" } },
            },
          },
        ],
        pipes: [
          freeRun("back", 2, [], 12),
          freeRun(
            "front",
            3,
            [{ id: "tt", at: { x: 2, y: 3 }, label: "TT", value: slot("t") }],
            12,
          ),
        ],
      },
      { slots: { "tag.tt": live("52.4", 52.4, "°C") }, devices: {} },
    );
    const tag = c.querySelector("[data-tag='tt']")!;
    expect(tag.getAttribute("data-side")).toBe("below");
    const chip = box(tag.querySelector("rect")!);
    for (const seg of casingSegments(c))
      expect(clearOfRun(chip, seg)).toBe(true);
  });

  it("hangs a tag clear of a parallel run one row behind, and of a neighbour's label", () => {
    // Two free runs along +x one row apart: a chip lifted 44 px from the
    // front run is centred on the back one, 40 px up on screen.
    const c = draw(
      {
        ...DOC,
        symbols: [],
        labels: [],
        pipes: [
          freeRun("back", 0),
          freeRun("front", 1, [
            { id: "tt", at: { x: 3, y: 1 }, label: "TT", value: slot("t") },
          ]),
        ],
      },
      { slots: { "tag.tt": live("52.4", 52.4, "°C") }, devices: {} },
    );
    const chip = box(c.querySelector("[data-tag='tt'] rect")!);
    for (const seg of casingSegments(c))
      expect(clearOfRun(chip, seg)).toBe(true);
    // The same tag beside an inline pump: the pump's label keeps its room,
    // and so does the state dot on the motor, so the chip covers neither.
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
          freeRun("front", 1, [
            { id: "tt", at: { x: 3, y: 1 }, label: "TT", value: slot("t") },
          ]),
        ],
      },
      {
        slots: {
          "tag.tt": live("52.4", 52.4, "°C"),
          "symbol.p.state": live("MARCHE", true),
        },
        devices: {},
      },
    );
    const led = pumped.querySelector("[data-state-dot='on']")!;
    const ledBox = {
      x0: Number(led.getAttribute("cx")) - 4.5,
      y0: Number(led.getAttribute("cy")) - 4.5,
      x1: Number(led.getAttribute("cx")) + 4.5,
      y1: Number(led.getAttribute("cy")) + 4.5,
    };
    expect(
      apart(box(pumped.querySelector("[data-tag='tt'] rect")!), ledBox),
    ).toBe(true);
  });

  it("lights no LED on a stale state reading", () => {
    const c = draw(DOC, {
      ...VALUES,
      slots: {
        ...VALUES.slots,
        "symbol.pac.state": { ...live("MARCHE", true), stale: true },
      },
      devices: {},
    });
    const panel = c.querySelector("[data-panel='PAC 03']")!;
    expect(panel.querySelector("circle:not([data-row] circle)")).toBeNull();
    expect(q(c, "circle.fill-status-ok")).toHaveLength(0);
    // The row itself still says what it holds, muted with the disc.
    expect(panel.querySelector("[data-row='stale']")).not.toBeNull();
  });

  it("paints an inline symbol over the run it sits on, turned with it", () => {
    const c = draw(DOC, VALUES);
    // The closed valve drawn by the kit for a run along +y, as the branch
    // is: a solid handwheel, where the kit draws it for that cell.
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
    const expected = container.querySelector("[data-handwheel='closed']")!;
    const closed = q(c, "[data-handwheel='closed']").find(
      (e) =>
        e.getAttribute("cx") === expected.getAttribute("cx") &&
        e.getAttribute("cy") === expected.getAttribute("cy"),
    );
    expect(closed).toBeDefined();
    // Its own cell's piece of the run is painted before it.
    const under = q(c, "path.stroke-fluid-dhw")[1];
    expect(
      under.compareDocumentPosition(closed!) &
        under.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("paints a run's stub under the body it enters, and the chevrons outside it", () => {
    const c = draw();
    // The heat pump's cabinet: the first box of the kit on the plate.
    const body = c.querySelector("[data-volume='box'] polygon")!;
    const under = q(c, "path.stroke-fluid-primary-supply").filter(
      (p) => p.compareDocumentPosition(body) & p.DOCUMENT_POSITION_FOLLOWING,
    );
    // Only the stub inside the heat pump's far cell precedes its body.
    expect(under).toHaveLength(1);
    // The chevrons sit on the piece before the tank's stub, tip where the
    // run meets the drum: the kit's cylinder is wider than the glyph, so
    // the line from the face the run enters through meets it 0.13 of a
    // cell in.
    const face = portPoint("isometric", { x: 6, y: 0 }, "-x");
    const centre = project("isometric", 6.5, 0.5, PIPE_AXIS_Z);
    const reach = 0.5 - Math.sqrt(0.62 ** 2 - 0.5 ** 2);
    const arrow = c.querySelector("polygon.fill-fluid-primary-supply")!;
    const [tipX, tipY] = arrow
      .getAttribute("points")!
      .split(" ")[0]
      .split(",")
      .map(Number);
    // The kit's outline is a 40-gon, a hundredth of a pixel off the circle.
    expect(tipX).toBeCloseTo(face.x + (centre.x - face.x) * 2 * reach, 1);
    expect(tipY).toBeCloseTo(face.y + (centre.y - face.y) * 2 * reach, 1);
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
    const ys = q(turned, "[data-volume='box'] polygon").flatMap((face) =>
      face
        .getAttribute("points")!
        .split(" ")
        .map((p) => Number(p.split(",")[1])),
    );
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
    // The 2 x 2 footprint spans 96 px and its panel 144: the slab under
    // the machine, 0.7 of a cell past its footprint on every side, wins.
    const [, , w] = panel
      .querySelector("svg")!
      .getAttribute("viewBox")!
      .split(" ")
      .map(Number);
    const slab =
      project("isometric", 2.7, -0.7).x - project("isometric", -0.7, 2.7).x;
    expect(slab).toBeGreaterThan(PANEL_W);
    expect(w).toBeCloseTo(120 + slab);
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

  it("draws every plate committed under docs/specs/synoptic", () => {
    const committed = readdirSync(PLATES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect(committed.sort()).toEqual(Object.keys(PLATES).sort());
  });

  // One static render per plate serves its probes: the renderer is pure, and
  // the values fixture binds nothing on a committed plate.
  describe.each(PLATE_CASES)(
    "the %s plate",
    (name, { tees, panels, chips }) => {
      const doc = plate(name);
      const c = document.createElement("div");
      c.innerHTML = renderToStaticMarkup(<SynopticRenderer doc={doc} />);

      // The Est plate's panels hang off bodies with height; the Ouest plate
      // adds a panel on an inline glyph (the loop heater), whose drawn outline
      // is smaller than its cell.
      it("ends every readout leader on its symbol", () => {
        const projection = doc.projection ?? DEFAULT_PROJECTION;
        const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
        // A panel above its label leads to the label; any other spot, a
        // panel's or a displaced chip's, leads to a point of the drawn
        // body, inside the box the body takes on screen, never into the
        // void beside it.
        const labels = q(c, "text").map((t) => [
          Number(t.getAttribute("x")),
          Number(t.getAttribute("y")) - 4,
        ]);
        expect(q(c, "[data-leader='panel']")).toHaveLength(panels);
        const near = (pts: number[][], end: number[]) =>
          pts.some(([x, y]) => Math.hypot(x - end[0], y - end[1]) < 0.5);
        let onBody = 0;
        for (const readout of q(c, "[data-readout]")) {
          const leader = readout.querySelector("[data-leader]");
          if (!leader) continue;
          const end = [
            Number(leader.getAttribute("x2")),
            Number(leader.getAttribute("y2")),
          ];
          const symbol = symbols.get(readout.getAttribute("data-readout")!)!;
          const body = symbolBox(projection, symbol);
          const inside =
            end[0] >= body.x0 - 1 &&
            end[0] <= body.x1 + 1 &&
            end[1] >= body.y0 - 1 &&
            end[1] <= body.y1 + 1;
          if (inside) onBody += 1;
          expect(inside || near(labels, end), readout.outerHTML).toBe(true);
        }
        // PAC 04 takes a spot beside its body on the reference plate: its
        // leader is one that must land on the body.
        expect(onBody).toBeGreaterThan(0);
      });

      // A chip under its label (centred on the symbol's cell) needs no
      // leader; one the search sent elsewhere is joined to its symbol.
      it("joins every displaced chip to its symbol", () => {
        const projection = doc.projection ?? DEFAULT_PROJECTION;
        const cells = new Map(
          (doc.symbols ?? []).map((s) => [s.id, s.placement.cell]),
        );
        const readouts = q(c, "[data-readout]").filter((g) =>
          g.querySelector("[data-chip]"),
        );
        expect(readouts.length).toBeGreaterThan(0);
        for (const readout of readouts) {
          const id = readout.getAttribute("data-readout")!;
          const cell = cells.get(id)!;
          // A displaced name carries its own leader: a chip hanging under
          // it is joined through it.
          const name = c.querySelector(`[data-symbol-label='${id}'] text`);
          const centre = name
            ? Number(name.getAttribute("x"))
            : project(projection, cell.x + 0.5, cell.y + 0.5, 0).x;
          const rect = box(readout.querySelector("rect")!);
          const hanging = Math.abs((rect.x0 + rect.x1) / 2 - centre) < 0.5;
          const leader = readout.querySelector("[data-leader='chip']");
          expect(hanging || leader !== null, readout.outerHTML).toBe(true);
        }
      });

      it("renders whole", () => {
        expect(q(c, "[data-unknown-symbol]")).toHaveLength(0);
        expect(q(c, "[data-panel]")).toHaveLength(panels);
        expect(q(c, "circle[data-tee]")).toHaveLength(tees);
        expect(q(c, "[data-chip]")).toHaveLength(chips);
        // Every tag is a chip on its run: a reading the drawing shows and no
        // device reads carries the literal that says so, a live one without a
        // value the silent dash; a line code carries no chip.
        // The value is the text right after the chip's frame; a caption may
        // precede the frame and a unit follow the value.
        const chipText = (id: string) =>
          q(c, `[data-tag='${id}'] [data-chip] rect + text`)[0]?.textContent;
        for (const tag of (doc.pipes ?? []).flatMap((p) => p.tags ?? [])) {
          const value = tag.value;
          expect(chipText(tag.id)).toBe(
            value
              ? value.kind === "text"
                ? value.text
                : SILENT_TEXT
              : undefined,
          );
        }
        // Free labels, and a chip only under the ones carrying a reading.
        const freeLabels = doc.labels ?? [];
        expect(q(c, "[data-label]")).toHaveLength(freeLabels.length);
        expect(q(c, "[data-label='caption'] [data-chip]")).toHaveLength(
          freeLabels.filter((label) => label.value).length,
        );
        for (const fluid of new Set((doc.pipes ?? []).map((p) => p.fluid))) {
          expect(
            q(c, `polygon.fill-fluid-${fluid.replace(/_/g, "-")}`).length,
          ).toBeGreaterThan(0);
        }
        // Readouts clear the runs as well as the bodies: no panel overlaps
        // another, no run is drawn across a panel, and every chip (a tag's or
        // a symbol's single reading) clears every run, panel, other chip and
        // symbol label. A readout whose search found no spot falls back onto
        // its own glyph, which is where a run passes; a chip sent beside its
        // symbol because a run blocks the spot under the label must not land
        // on that label (visual language, Decision 14).
        const frames = q(c, "[data-panel] > rect").map(box);
        const runs = casingSegments(c);
        // A collector's name lies along its bar: its box is not the level
        // one this reads, and it is placed by the bar, not by the search.
        const labels = q(
          c,
          "text[font-size='11'][font-weight='600']:not([data-axis-label])",
        ).map((t) => {
          const x = Number(t.getAttribute("x"));
          const y = Number(t.getAttribute("y"));
          const w = textWidth(t.textContent ?? "", 11);
          // A caption in a panel row starts at its x; a label is centred.
          const anchor = t.getAttribute("text-anchor") ?? "start";
          const x0 =
            anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
          return { x0, y0: y - 11, x1: x0 + w, y1: y };
        });
        pairwiseApart(frames);
        for (const frame of frames) {
          expect(runs.every((run) => clearOfRun(frame, run))).toBe(true);
        }
        const chipBoxes = q(c, "[data-chip] rect").map(box);
        pairwiseApart(chipBoxes);
        for (const chip of chipBoxes) {
          expect(runs.every((run) => clearOfRun(chip, run))).toBe(true);
          expect([...frames, ...labels].every((o) => apart(chip, o))).toBe(
            true,
          );
        }
      });

      // In the 2:1 projection a cell at z = 1 lands where the cell one step
      // back on both axes lands at grade, so an overhead run along a row paints
      // straight over whatever sits on the row behind it: a feed routed over
      // the departure collector's row read as a hot run through the collector.
      it("draws no run along another run or a collector bar", () => {
        const projection = doc.projection ?? DEFAULT_PROJECTION;
        const segs = casingSegments(c);
        const along: string[] = [];
        segs.forEach((a, i) =>
          segs.slice(i + 1).forEach((b) => {
            if (collinearOverlap(a, b) > 1) along.push(`${a} over ${b}`);
          }),
        );
        expect(along).toEqual([]);
        // A bar's own port stubs leave from a port cell's centre, so a run
        // along the bar between its first and last cell centres is foreign.
        for (const s of doc.symbols ?? []) {
          if (s.type !== "collector" || s.placement.kind !== "cell") continue;
          const { x, y } = s.placement.cell;
          const { axis, length } = s.props as {
            axis: "x" | "y";
            length: number;
          };
          const end =
            axis === "x"
              ? [x + length - 0.5, y + 0.5]
              : [x + 0.5, y + length - 0.5];
          const p0 = project(projection, x + 0.5, y + 0.5, PIPE_AXIS_Z);
          const p1 = project(projection, end[0], end[1], PIPE_AXIS_Z);
          const bar: Seg = [
            [p0.x, p0.y],
            [p1.x, p1.y],
          ];
          const over = segs.filter((seg) => collinearOverlap(bar, seg) > 1);
          expect(over, s.id).toEqual([]);
        }
      });

      // Names are placed before any reading, clear of every run: the kit's
      // spot when it is free, else the first clear spot around the body,
      // joined to it by a leader once it stands off it.
      it("keeps every name off the runs, and joins a displaced one to its body", () => {
        const projection = doc.projection ?? DEFAULT_PROJECTION;
        const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
        const runs = casingSegments(c);
        const names = q(c, "[data-symbol-label]");
        expect(names.length).toBeGreaterThan(0);
        let leaders = 0;
        for (const name of names) {
          const text = name.querySelector("text")!;
          const box = labelBox(text);
          expect(
            runs.every((run) => clearOfRun(box, run)),
            text.textContent!,
          ).toBe(true);
          const leader = name.querySelector("[data-leader='label']");
          if (!leader) continue;
          leaders += 1;
          const id = name.getAttribute("data-symbol-label")!;
          const end = {
            x: Number(leader.getAttribute("x2")),
            y: Number(leader.getAttribute("y2")),
          };
          expect(within(end, symbolBox(projection, symbols.get(id)!)), id).toBe(
            true,
          );
        }
        // Every plate has names the runs push off the kit's spot.
        expect(leaders).toBeGreaterThan(0);
        // No run ever moves: the machine shows the run state.
        expect(q(c, "path.animate-flow")).toHaveLength(0);
      });
    },
  );

  describe("click-through", () => {
    const link = (id: string, synoptic_id: string | null): SymbolElement => ({
      id,
      type: "link",
      placement: { kind: "cell", cell: { x: 12, y: 0 } },
      label: id,
      props: { synoptic_id, caption: null },
    });
    const LINKED: Synoptic = {
      ...DOC,
      symbols: [
        ...(DOC.symbols ?? []),
        link("to-west", "west"),
        link("to-gone", "gone"),
        link("boundary", null),
        { ...(DOC.symbols ?? [])[2], id: "col-dev", device_id: "COL-1" },
      ],
    };
    const known = new Set(["west"]);
    const drawLinked = (knownSynoptics: Set<string> | undefined = known) => {
      const onSymbolClick = vi.fn();
      const { container } = render(
        <SynopticRenderer
          doc={LINKED}
          knownSynoptics={knownSynoptics}
          onSymbolClick={onSymbolClick}
        />,
      );
      return { c: container, onSymbolClick };
    };
    const buttons = (c: Element) =>
      q(c, "[role='button']").map((g) => g.getAttribute("data-symbol"));

    it("makes a button of a device symbol and of a link to a known plate, nothing else", () => {
      const { c } = drawLinked();
      // "An explicit, optional device_id on the symbol is the sole source of
      // click-through": b01 reads PAC-03's temperature but is no device.
      // A collector that is a device gets the same button as a drawn type.
      expect(buttons(c).sort()).toEqual(["col-dev", "pac", "to-west"]);
      expect(
        c.querySelector("[data-symbol='pac']")?.getAttribute("data-affordance"),
      ).toBe("device");
      expect(
        c
          .querySelector("[data-symbol='to-west']")
          ?.getAttribute("data-affordance"),
      ).toBe("link");
      expect(c.querySelector("[data-symbol='boundary']")).toBeNull();
    });

    it("draws a link to an unknown plate faded, dashed and inert", () => {
      const { c } = drawLinked();
      const gone = c.querySelector("[data-symbol='to-gone']")!;
      expect(gone.hasAttribute("data-missing")).toBe(true);
      expect(gone.getAttribute("role")).toBeNull();
      expect(gone.getAttribute("stroke-dasharray")).toBe("3 2");
      expect(gone.querySelector("title")?.textContent).toBe("gone");
    });

    it("makes no button at all without a click handler, but still marks a missing link", () => {
      const { container: c } = render(
        <SynopticRenderer doc={LINKED} knownSynoptics={known} />,
      );
      expect(buttons(c)).toEqual([]);
      expect(
        q(c, "[data-missing]").map((g) => g.getAttribute("data-symbol")),
      ).toEqual(["to-gone"]);
    });

    it("keeps a double click on the symbol, away from the canvas refit, and activates once", () => {
      const onCanvasDoubleClick = vi.fn();
      const onSymbolClick = vi.fn();
      const { container: c } = render(
        <div onDoubleClick={onCanvasDoubleClick}>
          <SynopticRenderer
            doc={LINKED}
            knownSynoptics={known}
            onSymbolClick={onSymbolClick}
          />
        </div>,
      );
      const pac = c.querySelector("[data-symbol='pac']")!;
      fireEvent.click(pac, { detail: 1 });
      fireEvent.click(pac, { detail: 2 });
      fireEvent.doubleClick(pac);
      expect(onSymbolClick).toHaveBeenCalledTimes(1);
      expect(onCanvasDoubleClick).not.toHaveBeenCalled();
      fireEvent.doubleClick(c.querySelector("svg")!);
      expect(onCanvasDoubleClick).toHaveBeenCalledTimes(1);
    });

    it("leaves every link inert when no plate list is given", () => {
      const { container: c } = render(
        <SynopticRenderer doc={LINKED} onSymbolClick={vi.fn()} />,
      );
      expect(buttons(c).sort()).toEqual(["col-dev", "pac"]);
      expect(q(c, "[data-missing]")).toHaveLength(0);
    });

    it("reports the activated symbol on click and on Enter, not on other keys", () => {
      const { c, onSymbolClick } = drawLinked();
      const pac = c.querySelector("[data-symbol='pac']")!;
      fireEvent.click(pac);
      expect(onSymbolClick).toHaveBeenCalledTimes(1);
      expect(onSymbolClick.mock.calls[0][0].id).toBe("pac");
      fireEvent.keyDown(c.querySelector("[data-symbol='to-west']")!, {
        key: "Enter",
      });
      expect(onSymbolClick.mock.calls[1][0].id).toBe("to-west");
      fireEvent.keyDown(pac, { key: "a" });
      expect(onSymbolClick).toHaveBeenCalledTimes(2);
    });

    it("renders the same buttons on the flat sheet", () => {
      const { container } = render(
        <SynopticRenderer
          doc={{ ...LINKED, projection: "flat" }}
          knownSynoptics={known}
          onSymbolClick={vi.fn()}
        />,
      );
      expect(buttons(container).sort()).toEqual(["col-dev", "pac", "to-west"]);
    });
  });
});

describe("SynopticRenderer, the illustrated kit on the plate", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The canvas view, read off the transform the viewport puts on its group. */
  const canvasView = (c: Element) => {
    const m = /translate\((\S+) (\S+)\) scale\((\S+)\)/.exec(
      c.querySelector("svg > g")!.getAttribute("transform")!,
    )!;
    return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
  };
  /** Where the plate's frame sits inside the canvas. */
  const frameOffset = (c: Element) => {
    const m = /translate\((\S+) (\S+)\)/.exec(
      c.querySelector("svg > g > g[transform]")!.getAttribute("transform")!,
    )!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };
  const near = (a: TestBox, b: TestBox) => {
    expect(a.x0).toBeCloseTo(b.x0);
    expect(a.y0).toBeCloseTo(b.y0);
    expect(a.x1).toBeCloseTo(b.x1);
    expect(a.y1).toBeCloseTo(b.y1);
  };

  it("stands the equipment on slabs painted under everything, in the isometric view only", () => {
    const c = draw();
    const slabs = q(c, "[data-slab]");
    // The heat pump on (0,0)..(1,1) stands four cells from the tank on
    // (6,0)..(6,1): its own slab. The valve riding the branch at (5,2)
    // touches the tank's footprint corner: they share one. The bar and
    // the unknown type carry nothing.
    expect(slabs).toHaveLength(2);
    // A lip, a side and the top face, painted with the kit's slab gradient.
    expect(slabs[0].querySelectorAll("polygon")).toHaveLength(3);
    expect(
      slabs[0].querySelector("polygon[fill='url(#syn-slab)']"),
    ).not.toBeNull();
    // Every slab precedes every run, body and text on the plate.
    const drawn = q(c, "path[data-casing], [data-volume], text");
    expect(drawn.length).toBeGreaterThan(0);
    for (const slab of slabs) {
      for (const el of drawn) {
        expect(
          slab.compareDocumentPosition(el) & slab.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    }
    expect(q(draw({ ...DOC, projection: "flat" }), "[data-slab]")).toHaveLength(
      0,
    );
  });

  it("cuts the bar per cell, and hits it with one transparent bar only for a device with a click handler", () => {
    const bar = (extra: Partial<SymbolElement>, onSymbolClick?: () => void) => {
      const { container } = render(
        <SynopticRenderer
          doc={{
            ...DOC,
            symbols: [{ ...DOC.symbols![2], ...extra }],
            pipes: [],
            labels: [],
          }}
          onSymbolClick={onSymbolClick}
        />,
      );
      return container;
    };
    const plain = bar({});
    expect(q(plain, "[data-collector-cell]")).toHaveLength(3);
    expect(q(plain, "[data-collector-hit]")).toHaveLength(0);
    expect(q(bar({ device_id: "COL-1" }), "[data-collector-hit]")).toHaveLength(
      0,
    );
    expect(q(bar({}, vi.fn()), "[data-collector-hit]")).toHaveLength(0);
    const hit = q(bar({ device_id: "COL-1" }, vi.fn()), "[data-collector-hit]");
    expect(hit).toHaveLength(1);
    // One bar over the three cells (3,3)..(5,3) on the pipe axis plane,
    // inside the button, so a click anywhere on the bar is a click on it.
    expect(hit[0].getAttribute("points")).toBe(
      "-24,62.4 72,62.4 72,110.4 -24,110.4",
    );
    expect(hit[0].getAttribute("fill")).toBe("transparent");
    expect(hit[0].closest("[role='button']")?.getAttribute("data-symbol")).toBe(
      "col",
    );
  });

  it("writes a literal as an unframed note, on a tag and as a symbol's reading alike", () => {
    const c = draw({
      ...DOC,
      symbols: [
        {
          ...DOC.symbols![1],
          bindings: { temperature: { kind: "text", text: "non mesurée" } },
        },
      ],
      pipes: [
        freeRun("run", 4, [
          {
            id: "tt",
            at: { x: 2, y: 4 },
            label: "TT",
            value: { kind: "text", text: "—" },
          },
        ]),
      ],
      labels: [],
    });
    const notes = q(c, "[data-chip='note']");
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      const rect = note.querySelector("rect")!;
      expect(rect.getAttribute("stroke")).toBe("none");
      expect(rect.getAttribute("fill")).toBe("none");
      expect(rect.getAttribute("rx")).toBeNull();
    }
    // A note is sized to its text, with none of a chip's padding.
    expect(
      c
        .querySelector("[data-readout='b01'] [data-chip='note'] rect")
        ?.getAttribute("width"),
    ).toBe(String(chipWidth("non mesurée", null, true)));
    expect(
      c.querySelector("[data-tag='tt'] [data-chip='note'] rect + text")
        ?.textContent,
    ).toBe("—");
    expect(
      q(c, "[data-chip='live'], [data-chip='silent'], [data-chip='stale']"),
    ).toHaveLength(0);
  });

  it("rings the highlighted symbol alone, 6 px off its body", () => {
    const rings = (highlightId?: string | null) => {
      const { container } = render(
        <SynopticRenderer doc={DOC} highlightId={highlightId} />,
      );
      return q(container, "[data-highlight]");
    };
    expect(rings()).toHaveLength(0);
    expect(rings(null)).toHaveLength(0);
    expect(rings("nope")).toHaveLength(0);
    const pac = rings("pac");
    expect(pac).toHaveLength(1);
    expect(pac[0].getAttribute("data-highlight")).toBe("pac");
    const body = symbolBox("isometric", DOC.symbols![0]);
    near(box(pac[0]), {
      x0: body.x0 - 6,
      y0: body.y0 - 6,
      x1: body.x1 + 6,
      y1: body.y1 + 6,
    });
    expect(pac[0].getAttribute("pointer-events")).toBe("none");
    expect(pac[0].getAttribute("rx")).toBe("6");
    // A bar is ringed as a whole.
    expect(rings("col")).toHaveLength(1);
  });

  it("reports the symbol under the pointer, null when it leaves, and wraps nothing without a listener", () => {
    const onSymbolHover = vi.fn();
    const { container: c } = render(
      <SynopticRenderer doc={DOC} onSymbolHover={onSymbolHover} />,
    );
    // One wrapper per drawn symbol, the bar's over its pieces.
    expect(
      q(c, "[data-hover]")
        .map((g) => g.getAttribute("data-hover"))
        .sort(),
    ).toEqual(["b01", "col", "mystery", "pac", "v-03"]);
    const pac = c.querySelector("[data-hover='pac']")!;
    fireEvent.pointerEnter(pac);
    expect(onSymbolHover).toHaveBeenCalledTimes(1);
    expect(onSymbolHover.mock.calls[0][0]).toBe(DOC.symbols![0]);
    fireEvent.pointerLeave(pac);
    expect(onSymbolHover).toHaveBeenCalledTimes(2);
    expect(onSymbolHover.mock.calls[1][0]).toBeNull();
    expect(q(draw(), "[data-hover]")).toHaveLength(0);
    // A bar that is a device reports through its click bar.
    const { container: bar } = render(
      <SynopticRenderer
        doc={{
          ...DOC,
          symbols: [{ ...DOC.symbols![2], device_id: "COL-1" }],
          pipes: [],
          labels: [],
        }}
        onSymbolClick={vi.fn()}
        onSymbolHover={onSymbolHover}
      />,
    );
    expect(
      bar.querySelector("[data-hover='col'] [data-collector-hit]"),
    ).not.toBeNull();
  });

  it("draws the actuator's M on the glyph in both views, and hangs no name over an unlabelled valve", () => {
    const unnamed = (projection: "flat" | "isometric") =>
      draw({
        ...DOC,
        projection,
        symbols: [
          {
            id: "mv",
            type: "mixing_valve",
            placement: { kind: "cell", cell: { x: 2, y: 2 } },
          },
        ],
        pipes: [],
        labels: [],
      });
    // The actuator (ISO 14617 C0082) carries the `M` on the glyph of the
    // sheet as on the volume: no name is placed for an unlabelled valve,
    // and no second `M` hangs above it, in either view.
    for (const projection of ["flat", "isometric"] as const) {
      const c = unnamed(projection);
      expect(c.querySelector("[data-symbol-label='mv']")).toBeNull();
      expect(q(c, "text").filter((t) => t.textContent === "M")).toHaveLength(1);
    }
  });

  it("moves a name off a run through the kit's spot, and joins it to the body once it stands off it", () => {
    /** A free run along +x on row `y`, from x = -6 to 14, over and past
     *  the tank on (6,0)..(6,1). */
    const run = (y: number): PipeElement => ({
      id: `r${y}`,
      fluid: "dhw",
      from: { kind: "cell", cell: { x: -6, y } },
      to: { kind: "cell", cell: { x: 14, y } },
      waypoints: [],
      tags: [],
    });
    const tank = (label: string, rows: number[]) =>
      draw({
        ...DOC,
        symbols: [{ ...DOC.symbols![1], label, bindings: {} }],
        pipes: rows.map(run),
        labels: [],
      });
    const name = (c: Element) => {
      const g = c.querySelector("[data-symbol-label='b01']")!;
      const text = g.querySelector("text")!;
      return {
        at: {
          x: Number(text.getAttribute("x")),
          y: Number(text.getAttribute("y")),
        },
        box: labelBox(text),
        leader: g.querySelector("[data-leader='label']"),
      };
    };
    // The kit's spot: 10 px above the dome of the tank.
    const dome = project("isometric", 6.5, 1, 2.38);
    const spot = { x: dome.x, y: dome.y - 10 };
    const free = name(tank("B01", []));
    expect(free.at).toEqual(spot);
    expect(free.leader).toBeNull();
    // A run on row -2 passes 2 px under that spot: the name steps aside
    // to the first clear spot of the first ring, 6 px off its body, so
    // it needs no leader.
    const aside = tank("B01", [-2]);
    const stepped = name(aside);
    expect(stepped.at).not.toEqual(spot);
    expect(stepped.leader).toBeNull();
    for (const seg of casingSegments(aside))
      expect(clearOfRun(stepped.box, seg)).toBe(true);
    // Runs on every row around the drum and a long name: the name goes a
    // ring or more out, with a leader from its box to the drum.
    const c = tank("RÉSERVOIR TAMPON PRINCIPAL 01", [-3, -2, -1, 2, 3]);
    const far = name(c);
    expect(far.leader).not.toBeNull();
    for (const seg of casingSegments(c))
      expect(clearOfRun(far.box, seg)).toBe(true);
    const end = {
      x: Number(far.leader!.getAttribute("x2")),
      y: Number(far.leader!.getAttribute("y2")),
    };
    expect(within(end, symbolBox("isometric", DOC.symbols![1]))).toBe(true);
    // The drum stands below and left of the name: the leader leaves the
    // box at its near corner.
    expect(Number(far.leader!.getAttribute("x1"))).toBeCloseTo(far.box.x0);
    expect(Number(far.leader!.getAttribute("y1"))).toBeCloseTo(far.box.y1);
  });

  it("writes a link's caption beside its arrow tip in the isometric view, and on its face on the sheet", () => {
    const caption = (projection: Projection, rotation: number) =>
      draw({
        ...DOC,
        projection,
        symbols: [
          {
            id: "to-west",
            type: "link",
            placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation },
            label: "ECS OUEST",
            props: { synoptic_id: "west", caption: null },
          },
        ],
        pipes: [],
        labels: [],
      }).querySelector("[data-symbol-label='to-west'] text")!;
    // Pointing -x, the tip is the leftmost point on screen: the caption
    // ends 8 px left of it, on one line.
    const tip = project("isometric", 0.05, 1, PIPE_AXIS_Z);
    const left = caption("isometric", 0);
    expect(left.getAttribute("text-anchor")).toBe("end");
    expect([
      Number(left.getAttribute("x")),
      Number(left.getAttribute("y")),
    ]).toEqual([tip.x - 8, tip.y + 4]);
    expect(left.querySelectorAll("tspan")).toHaveLength(1);
    // Turned to point +x, the tip is the rightmost point: the caption
    // starts 8 px right of it.
    const turned = project("isometric", 0.95, 0, PIPE_AXIS_Z);
    const right = caption("isometric", 2);
    expect(right.getAttribute("text-anchor")).toBe("start");
    expect(Number(right.getAttribute("x"))).toBeCloseTo(turned.x + 8);
    // On the sheet the caption is written on the face, one line per word.
    const face = caption("flat", 0);
    expect(face.getAttribute("text-anchor")).toBe("middle");
    expect(face.querySelectorAll("tspan")).toHaveLength(2);
  });

  it("keeps a tag's chip off an authored label", () => {
    const tagged = (labels: LabelElement[]) =>
      draw(
        {
          ...DOC,
          symbols: [],
          labels,
          pipes: [
            freeRun("front", 1, [
              { id: "tt", at: { x: 3, y: 1 }, label: "TT", value: slot("t") },
            ]),
          ],
        },
        { slots: { "tag.tt": live("52.4", 52.4, "°C") }, devices: {} },
      );
    const alone = tagged([]);
    expect(
      alone.querySelector("[data-tag='tt']")!.getAttribute("data-side"),
    ).toBe("above");
    // A note written 40 px above the tag's point on the run, where the
    // chip would rise: the tag hangs under the run instead, clear of it.
    const note: LabelElement = {
      id: "n",
      at: { x: 17 / 12, y: -7 / 12 },
      text: "NOTE",
      role: "note",
    };
    const c = tagged([note]);
    const written = c.querySelector("[data-label='note'] text")!;
    expect(Number(written.getAttribute("x"))).toBeCloseTo(48);
    expect(Number(written.getAttribute("y"))).toBeCloseTo(10);
    const tag = c.querySelector("[data-tag='tt']")!;
    expect(tag.getAttribute("data-side")).toBe("below");
    const chip = box(tag.querySelector("rect")!);
    expect(
      apart(chip, { x0: 48, y0: -1, x1: 48 + textWidth("NOTE", 11), y1: 10 }),
    ).toBe(true);
    expect(chip).not.toEqual(box(alone.querySelector("[data-tag='tt'] rect")!));
  });

  describe("plate handle", () => {
    const drive = (doc = DOC) => {
      const plateRef = createRef<PlateHandle | null>();
      const frameRef = createRef<SVGGElement>();
      const onViewChange = vi.fn();
      const { container: c } = render(
        <SynopticRenderer
          doc={doc}
          plateRef={plateRef}
          frameRef={frameRef}
          onViewChange={onViewChange}
        />,
      );
      const [, , width, height] = c
        .querySelector("svg")!
        .getAttribute("viewBox")!
        .split(" ")
        .map(Number);
      return {
        c,
        handle: plateRef.current!,
        frame: frameRef.current!,
        onViewChange,
        width,
        height,
      };
    };

    it("zooms about the canvas centre, fits again, and reports each view", () => {
      const { c, handle, onViewChange, width, height } = drive();
      expect(onViewChange).toHaveBeenLastCalledWith({ x: 0, y: 0, scale: 1 });
      act(() => handle.zoomBy(2));
      expect(canvasView(c)).toEqual({
        x: -width / 2,
        y: -height / 2,
        scale: 2,
      });
      expect(onViewChange).toHaveBeenLastCalledWith({
        x: -width / 2,
        y: -height / 2,
        scale: 2,
      });
      act(() => handle.fit());
      expect(canvasView(c)).toEqual({ x: 0, y: 0, scale: 1 });
    });

    it("brings a symbol's body to the centre of the canvas at the scale asked", () => {
      const { c, handle, width, height } = drive();
      act(() => handle.focusSymbol("b01", 3));
      const view = canvasView(c);
      expect(view.scale).toBe(3);
      // The body's centre, in canvas units, lands on the canvas centre.
      const body = symbolBox("isometric", DOC.symbols![1]);
      const offset = frameOffset(c);
      const centre = {
        x: (body.x0 + body.x1) / 2 + offset.x,
        y: (body.y0 + body.y1) / 2 + offset.y,
      };
      expect(view.x + centre.x * 3).toBeCloseTo(width / 2);
      expect(view.y + centre.y * 3).toBeCloseTo(height / 2);
      // Two is the scale by default; an id the plate does not draw moves
      // nothing.
      act(() => handle.focusSymbol("pac"));
      expect(canvasView(c).scale).toBe(2);
      const before = canvasView(c);
      act(() => handle.focusSymbol("nope"));
      expect(canvasView(c)).toEqual(before);
    });

    it("maps a symbol's body through the frame's screen transform, null for an id it does not draw", () => {
      // jsdom lays nothing out: the frame's screen transform is stubbed
      // as a scale and a shift, flipped on y.
      vi.stubGlobal(
        "DOMPoint",
        class {
          constructor(
            public x: number,
            public y: number,
          ) {}
          matrixTransform(m: { a: number; d: number; e: number; f: number }) {
            return { x: this.x * m.a + m.e, y: this.y * m.d + m.f };
          }
        },
      );
      const { handle, frame } = drive();
      Object.defineProperty(frame, "getScreenCTM", {
        configurable: true,
        value: () => ({ a: 2, d: -2, e: 10, f: 500 }),
      });
      const body = symbolBox("isometric", DOC.symbols![0]);
      const rect = handle.symbolClientRect("pac")!;
      expect(rect).toBeInstanceOf(DOMRect);
      expect(rect.x).toBeCloseTo(body.x0 * 2 + 10);
      expect(rect.width).toBeCloseTo((body.x1 - body.x0) * 2);
      // The flipped axis still gives a positive height from the top edge.
      expect(rect.y).toBeCloseTo(500 - body.y1 * 2);
      expect(rect.height).toBeCloseTo((body.y1 - body.y0) * 2);
      expect(handle.symbolClientRect("nope")).toBeNull();
    });

    it("has no rectangle before layout: a frame with no screen transform answers null", () => {
      const { handle, frame } = drive();
      Object.defineProperty(frame, "getScreenCTM", {
        configurable: true,
        value: () => null,
      });
      expect(handle.symbolClientRect("pac")).toBeNull();
    });

    it("answers null rather than throwing where the frame cannot give a screen transform at all, as in jsdom", () => {
      const { handle, frame } = drive();
      // jsdom's <g> has no getScreenCTM: a page reading the rectangle in
      // an effect, as PlateView does, must not crash into its boundary.
      expect(typeof frame.getScreenCTM).toBe("undefined");
      expect(() => handle.symbolClientRect("pac")).not.toThrow();
      expect(handle.symbolClientRect("pac")).toBeNull();
    });
  });
});
