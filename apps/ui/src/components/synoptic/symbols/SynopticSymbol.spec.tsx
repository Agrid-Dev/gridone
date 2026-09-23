import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { symbolSchemas, type Projection } from "@gridone/sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  ISO_AXIS_DEG,
  isoEllipse,
  PIPE_AXIS_Z,
  project,
  unproject,
} from "../projection";
import type { Pt } from "../types";
import { Collector, collectorLabelAnchor } from "./Collector";
import { DRAWINGS } from "./drawings";
import { indication, TANK_R } from "./kit";
import type { SymbolState } from "./Label";
import { SynopticSymbol, symbolLabelAnchor } from "./SynopticSymbol";

afterEach(cleanup);

const draw = (ui: ReactElement) => {
  const { container } = render(<svg>{ui}</svg>);
  return container;
};

const TYPES = Object.keys(DRAWINGS);
const PROJECTIONS: Projection[] = ["isometric", "flat"];

describe("SynopticSymbol", () => {
  // The drift guard between the kit and the registry; the per-type cases
  // below are smoke only.
  it("draws every registered type except the collector", () => {
    const registered = Object.keys(symbolSchemas).filter(
      (t) => t !== "collector",
    );
    expect(TYPES.sort()).toEqual(registered.sort());
  });

  it.each(PROJECTIONS.flatMap((p) => TYPES.map((t) => [t, p] as const)))(
    "renders %s in the %s projection",
    (type, projection) => {
      const c = draw(
        <SynopticSymbol
          type={type}
          projection={projection}
          origin={{ x: 1, y: 2 }}
        />,
      );
      expect(
        c.querySelectorAll("polygon, path, ellipse, circle").length,
      ).toBeGreaterThan(0);
      expect(c.querySelector("[data-unknown-symbol]")).toBeNull();
    },
  );

  it("draws the kit's volume in isometric only, the glyph on the sheet", () => {
    const iso = draw(
      <SynopticSymbol
        type="tank"
        projection="isometric"
        origin={{ x: 0, y: 0 }}
      />,
    );
    // The drum, its dome, and no extruded glyph.
    expect(iso.querySelectorAll("[data-volume='cylinder']")).toHaveLength(2);
    expect(iso.querySelector("[data-volume='shadow']")).not.toBeNull();
    expect(iso.querySelector(".fill-synoptic-body-x")).toBeNull();
    const flat = draw(
      <SynopticSymbol type="tank" projection="flat" origin={{ x: 0, y: 0 }} />,
    );
    expect(flat.querySelector("[data-volume]")).toBeNull();
    // On the sheet nothing but the glyph is drawn: no footprint rectangle.
    expect(
      [...flat.querySelectorAll("polygon")].map((p) =>
        p.getAttribute("points"),
      ),
    ).not.toContain("0,0 40,0 40,80 0,80");
  });

  it("stands an inline machine on the run in isometric, and patches the sheet under its glyph", () => {
    const iso = draw(
      <SynopticSymbol
        type="pump"
        projection="isometric"
        origin={{ x: 0, y: 0 }}
      />,
    );
    // The volute, the motor and its state dot; no plate patch, the body
    // itself breaks the run.
    expect(iso.querySelector("[data-volume='cylinder']")).not.toBeNull();
    expect(iso.querySelector("[data-volume='box']")).not.toBeNull();
    expect(iso.querySelector("[data-state-dot]")).not.toBeNull();
    expect(iso.querySelector("polygon.fill-synoptic-plate")).toBeNull();
    const flat = draw(
      <SynopticSymbol type="pump" projection="flat" origin={{ x: 0, y: 0 }} />,
    );
    expect(flat.querySelector("polygon")!.className.baseVal).toBe(
      "fill-synoptic-plate stroke-none",
    );
  });

  it("points an inline glyph downstream, whichever way its run goes", () => {
    // The pump's impeller triangle, in the cell centred on (20, 20) of the
    // flat sheet: its tip is the vertex farthest along the run, and it must
    // be past the centre, not behind it.
    const triangle = (d: { x: number; y: number }) =>
      draw(
        <SynopticSymbol
          type="pump"
          projection="flat"
          origin={{ x: 0, y: 0 }}
          direction={d}
        />,
      )
        .querySelectorAll("polygon")[2]!
        .getAttribute("points")!
        .split(" ")
        .map((p) => p.split(",").map(Number));
    const along = (d: { x: number; y: number }) =>
      triangle(d).map(([x, y]) => (x - 20) * d.x + (y - 20) * d.y);
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const reach = along(d);
      // Two base corners behind the centre, one tip 0.21 cells past it.
      expect(reach.filter((r) => r < 0)).toHaveLength(2);
      expect(Math.max(...reach)).toBeCloseTo(8.4, 5);
    }
  });

  it("shows a closed isolation valve as a solid bowtie", () => {
    const bowtie = (state?: "on" | "off") =>
      draw(
        <SynopticSymbol
          type="valve_isolation"
          projection="flat"
          origin={{ x: 0, y: 0 }}
          state={state}
        />,
      ).querySelectorAll("polygon")[1]!.className.baseVal;
    expect(bowtie("off")).toContain("fill-synoptic-stroke");
    expect(bowtie("on")).toContain("fill-none stroke-synoptic-stroke");
    // No reading yet: muted, so the valve reads neither open nor closed.
    expect(bowtie()).toContain("fill-none stroke-muted-foreground");
  });

  it("carries the ISA mark when the instance has no label", () => {
    const text = (type: string, label?: string) =>
      draw(
        <SynopticSymbol
          type={type}
          projection="flat"
          origin={{ x: 0, y: 0 }}
          label={label}
        />,
      ).querySelector("text")?.textContent;
    expect(text("mixing_valve")).toBe("M");
    expect(text("energy_meter")).toBe("kWh");
    expect(text("mixing_valve", "MITIGEUR")).toBe("MITIGEUR");
    expect(text("pump")).toBeUndefined();
  });

  it("occludes the run under a sheet glyph with a plate patch of its own outline, never wider", () => {
    const first = (type = "mixing_valve") =>
      draw(
        <SynopticSymbol
          type={type}
          projection="flat"
          origin={{ x: 0, y: 0 }}
        />,
      ).querySelector("polygon")!;
    // The disc under the bowtie, plate-coloured with no stroke: a run stops
    // at the drawn edge, its stub reaches it.
    const patch = first();
    expect(patch.className.baseVal).toBe("fill-synoptic-plate stroke-none");
    expect(patch.getAttribute("stroke-width")).toBe("0");
    expect(patch.getAttribute("points")!.split(" ")).toHaveLength(40);
    // A tank on the sheet: the cylinder's circle, not the footprint square.
    const tank = first("tank");
    expect(tank.className.baseVal).toBe("fill-synoptic-plate stroke-none");
    expect(tank.getAttribute("points")!.split(" ")).toHaveLength(40);
    expect(tank.getAttribute("points")).not.toBe("0,0 40,0 40,80 0,80");
    expect(first("pump").className.baseVal).toBe(
      "fill-synoptic-plate stroke-none",
    );
    // In isometric the volume occludes on its own: no patch at all.
    const iso = draw(
      <SynopticSymbol
        type="mixing_valve"
        projection="isometric"
        origin={{ x: 0, y: 0 }}
      />,
    );
    expect(iso.querySelector("polygon.fill-synoptic-plate")).toBeNull();
    expect(iso.querySelector("[data-volume='box']")).not.toBeNull();
  });

  it("wraps a raised flat glyph's fault outline at the glyph's own height", () => {
    const outline = (z: number) =>
      draw(
        <SynopticSymbol
          type="valve_isolation"
          projection="isometric"
          origin={{ x: 2, y: 1, z }}
          faulty
        />,
      )
        .querySelector("polygon.stroke-status-error")!
        .getAttribute("points")!;
    // One cell up is 24 px up on screen, for the volume and its outline.
    const ys = (pts: string) =>
      pts.split(" ").map((p) => Number(p.split(",")[1]));
    const floor = ys(outline(0));
    const raised = ys(outline(1));
    expect(raised.map((y, i) => Math.round(floor[i] - y))).toEqual(
      floor.map(() => 24),
    );
  });

  it("keeps a flat label above the footprint's top edge when the body turns", () => {
    const labelY = (rotation: number) =>
      Number(
        draw(
          <SynopticSymbol
            type="tank"
            projection="flat"
            origin={{ x: 2, y: 2 }}
            rotation={rotation}
            label="B01"
          />,
        )
          .querySelector("text")!
          .getAttribute("y"),
      );
    // Upright, the 1 x 2 body spans y 80..160: label 10 px above 80.
    expect(labelY(0)).toBe(70);
    // A quarter turn lays it along x on y 80..120 (about the origin cell's
    // centre): the label follows the new top edge, not the old height.
    expect(labelY(1)).toBe(70);
    expect(labelY(2)).toBe(30);
  });

  it("labels above the body, with a run-state LED on the sheet", () => {
    const led = (state?: "on" | "off", faulty = false) =>
      draw(
        <SynopticSymbol
          type="pump"
          projection="flat"
          origin={{ x: 0, y: 0 }}
          label="P-01"
          state={state}
          faulty={faulty}
        />,
      );
    expect(led().querySelector("text")!.textContent).toBe("P-01");
    expect(led().querySelector("circle")).toBeNull();
    expect(led("on").querySelector("circle")!.className.baseVal).toBe(
      "fill-status-ok",
    );
    expect(led("off").querySelector("circle")!.className.baseVal).toBe(
      "fill-muted-foreground",
    );
    expect(
      led("off", true).querySelector("circle.fill-status-error"),
    ).not.toBeNull();
  });

  it("shows the run state on the machine in isometric, and no LED on the label", () => {
    const dot = (state?: "on" | "off", faulty = false) =>
      draw(
        <SynopticSymbol
          type="pump"
          projection="isometric"
          origin={{ x: 0, y: 0 }}
          label="P-01"
          state={state}
          faulty={faulty}
        />,
      );
    // Nothing known: a dashed hollow dot, and no LED after the name.
    const unknown = dot();
    expect(unknown.querySelector("text")!.textContent).toBe("P-01");
    expect(unknown.querySelectorAll("circle")).toHaveLength(1);
    expect(unknown.querySelector("[data-state-dot='unknown']")).not.toBeNull();
    expect(
      dot("on").querySelector("[data-state-dot='on']")!.getAttribute("class"),
    ).toContain("fill-status-ok");
    expect(
      dot("off").querySelector("[data-state-dot='off']")!.getAttribute("class"),
    ).toContain("fill-muted-foreground");
    // Fault first, whatever the state says.
    expect(
      dot("on", true).querySelector("[data-state-dot='fault']"),
    ).not.toBeNull();
    // The heat pump shows it on its fan, turning while it runs.
    const fan = (state?: "on" | "off") =>
      draw(
        <SynopticSymbol
          type="heat_pump"
          projection="isometric"
          origin={{ x: 0, y: 0 }}
          state={state}
        />,
      ).querySelector("[data-fan]")!;
    expect(fan("on").getAttribute("data-fan")).toBe("on");
    expect(
      fan("on").querySelector(".animate-\\[spin_2\\.4s_linear_infinite\\]"),
    ).not.toBeNull();
    expect(fan("off").querySelector("[class*='animate-']")).toBeNull();
    expect(fan().getAttribute("data-fan")).toBe("unknown");
  });

  it("puts no LED on an isolation valve: its state is on the glyph", () => {
    const c = draw(
      <SynopticSymbol
        type="valve_isolation"
        projection="flat"
        origin={{ x: 0, y: 0 }}
        label="V-1"
        state="on"
      />,
    );
    expect(c.querySelector("circle")).toBeNull();
  });

  it("writes the link caption on the face, one line per word", () => {
    const c = draw(
      <SynopticSymbol
        type="link"
        projection="flat"
        origin={{ x: 0, y: 0 }}
        label="ECS OUEST"
      />,
    );
    expect(c.querySelectorAll("tspan")).toHaveLength(2);
  });

  it("wraps a faulty body in the error colour with a badge", () => {
    const c = draw(
      <SynopticSymbol
        type="tank"
        projection="isometric"
        origin={{ x: 0, y: 0 }}
        faulty
      />,
    );
    expect(c.querySelector("polygon.stroke-status-error")).not.toBeNull();
    expect(c.querySelector("circle.fill-status-error")).not.toBeNull();
    expect(c.textContent).toContain("!");
  });

  it("moves with its origin and rotation", () => {
    const first = (el: Element) =>
      el.querySelector("polygon")!.getAttribute("points");
    const at = (origin: { x: number; y: number }, rotation = 0) =>
      draw(
        <SynopticSymbol
          type="heat_pump"
          projection="flat"
          origin={origin}
          rotation={rotation}
        />,
      );
    expect(first(at({ x: 1, y: 0 }))).toBe("40,0 120,0 120,80 40,80");
    // A quarter turn puts the 2 x 2 body on cells x in [-1, 1), y in [0, 2),
    // where `symbolPort` puts its ports.
    expect(first(at({ x: 0, y: 0 }, 1))).toBe("40,0 40,80 -40,80 -40,0");
  });

  it("degrades visibly on a type it cannot draw", () => {
    const c = draw(
      <SynopticSymbol
        type="reactor"
        projection="flat"
        origin={{ x: 0, y: 0 }}
      />,
    );
    expect(c.querySelector("[data-unknown-symbol='reactor']")).not.toBeNull();
    expect(c.textContent).toContain("reactor");
  });
});

describe("Collector", () => {
  const props = { axis: "x" as const, length: 4, ports: {} };

  it("draws a bar along its axis on the pipe axis plane, one piece per cell", () => {
    const c = draw(
      <Collector
        projection="flat"
        origin={{ x: 1, y: 1 }}
        shape={props}
        label="N-1"
      />,
    );
    const pieces = [...c.querySelectorAll("polygon")].map((p) =>
      p.getAttribute("points"),
    );
    expect(pieces).toHaveLength(4);
    expect(pieces[0]).toBe("40,52 80,52 80,68 40,68");
    expect(pieces[3]).toBe("160,52 200,52 200,68 160,68");
    expect(c.querySelector("text")!.textContent).toBe("N-1");
  });

  it("stands the bar along y", () => {
    const c = draw(
      <Collector
        projection="flat"
        origin={{ x: 0, y: 0 }}
        shape={{ ...props, axis: "y", length: 2 }}
      />,
    );
    expect(c.querySelector("polygon")!.getAttribute("points")).toBe(
      "12,0 28,0 28,40 12,40",
    );
  });

  it("is a capped tube in isometric, its name along the bar", () => {
    const c = draw(
      <Collector
        projection="isometric"
        origin={{ x: 1, y: 1 }}
        shape={props}
        label="N-1"
      />,
    );
    expect(c.querySelectorAll("[data-collector-cell]")).toHaveLength(4);
    expect(c.querySelectorAll("[data-volume='tube']")).toHaveLength(4);
    // A cap at each end of the bar, none in between.
    expect(c.querySelectorAll("ellipse")).toHaveLength(2);
    const label = c.querySelector("text[data-axis-label]")!;
    expect(label.textContent).toBe("N-1");
    expect(label.getAttribute("transform")).toMatch(/^rotate\(26\.57 /);
  });
});

/** The four ways a run may go through a cell. */
const RUN_DIRECTIONS: Pt[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const round2 = (v: number) => Math.round(v * 100) / 100;

describe("the illustrated kit", () => {
  const iso = (
    type: string,
    props: Partial<Parameters<typeof SynopticSymbol>[0]> = {},
  ) =>
    draw(
      <SynopticSymbol
        type={type}
        projection="isometric"
        origin={{ x: 0, y: 0 }}
        {...props}
      />,
    );

  it("stacks a tank from its shadow, its drum with two seams, and its dome", () => {
    const c = iso("tank");
    const drums = [...c.querySelectorAll("[data-volume='cylinder']")];
    expect(drums).toHaveLength(2);
    expect(c.querySelectorAll("[data-volume='shadow']")).toHaveLength(1);
    // Two seams: the front half of the rim, at half strength.
    expect(
      c.querySelectorAll("path[stroke-opacity='0.5'].stroke-synoptic-edge"),
    ).toHaveLength(2);
    // The drum is 0.62 of a cell in radius, wider than its cell, so a run
    // meets it before the cell's face.
    expect(TANK_R).toBe(0.62);
    expect(drums[0].querySelector("ellipse")!.getAttribute("rx")).toBe(
      String(round2(isoEllipse(0.62).rx)),
    );
  });

  it("mounts a pump's motor on its volute, dark sides under a lit top, the state dot on the motor", () => {
    const c = iso("pump", { state: "on" });
    expect(c.querySelectorAll("[data-volume='cylinder']")).toHaveLength(1);
    const faces = [...c.querySelectorAll("[data-volume='box'] polygon")];
    expect(
      faces.map((f) => f.getAttribute("class") ?? f.getAttribute("fill")),
    ).toEqual(["fill-synoptic-dark", "fill-synoptic-dark", "url(#syn-top)"]);
    // The dot sits 3 px above the motor's top, at the cell centre.
    const dot = c.querySelector("[data-state-dot='on']")!;
    const top = project("isometric", 0.5, 0.5, 1.02);
    expect(Number(dot.getAttribute("cx"))).toBe(round2(top.x));
    expect(Number(dot.getAttribute("cy"))).toBe(round2(top.y - 3));
  });

  it("draws a heat pump as a cabinet with louvres and a fan that turns only while it runs", () => {
    const c = iso("heat_pump", { state: "on" });
    expect(c.querySelectorAll("[data-volume='shadow']")).toHaveLength(1);
    expect(c.querySelectorAll("[data-volume='box']")).toHaveLength(1);
    // Four louvres on the +x side of the cabinet.
    expect(c.querySelectorAll("line.stroke-synoptic-edge")).toHaveLength(4);
    const fan = (state?: SymbolState, faulty = false) =>
      iso("heat_pump", { state, faulty }).querySelector("[data-fan]")!;
    const blades = (state?: SymbolState, faulty = false) =>
      fan(state, faulty)
        .querySelector(":scope > g > g")!
        .getAttribute("class")!;
    expect(blades("on")).toContain("fill-status-ok");
    expect(blades("on")).toContain("animate-[spin_2.4s_linear_infinite]");
    expect(blades("off")).toContain("fill-muted-foreground");
    expect(blades("off")).not.toContain("animate-");
    // Nothing known reads as off; a fault paints the blades red and stops
    // them, whatever the state says.
    expect(fan().getAttribute("data-fan")).toBe("unknown");
    expect(blades()).toContain("fill-muted-foreground");
    expect(blades()).not.toContain("animate-");
    expect(fan("on", true).getAttribute("data-fan")).toBe("fault");
    expect(blades("on", true)).toContain("fill-status-error");
    expect(blades("on", true)).not.toContain("animate-");
  });

  it("shows an isolation valve's handwheel solid when closed, hollow when open, dashed while unknown", () => {
    const wheel = (state?: SymbolState) =>
      iso("valve_isolation", { state }).querySelector("[data-handwheel]")!;
    expect(wheel("off").getAttribute("data-handwheel")).toBe("closed");
    expect(wheel("off").getAttribute("class")).toBe(
      "fill-synoptic-dark stroke-synoptic-dark",
    );
    expect(wheel("on").getAttribute("data-handwheel")).toBe("open");
    expect(wheel("on").getAttribute("class")).toBe(
      "fill-none stroke-synoptic-dark",
    );
    expect(wheel("on").getAttribute("stroke-dasharray")).toBeNull();
    expect(wheel().getAttribute("data-handwheel")).toBe("unknown");
    expect(wheel().getAttribute("stroke-dasharray")).toBe("3 2");
    expect(wheel().getAttribute("class")).toBe(
      "fill-none stroke-muted-foreground",
    );
    // The body is brass, standing on the run.
    expect(
      iso("valve_isolation")
        .querySelector("[data-volume='cylinder'] path")!
        .getAttribute("fill"),
    ).toBe("url(#syn-brass)");
  });

  it("points a check valve's arrow downstream whichever way its run goes", () => {
    for (const d of RUN_DIRECTIONS) {
      // Each corner of the arrow, read back into plan cells and measured
      // along the run from the cell centre.
      const along = iso("valve_check", { direction: d })
        .querySelector("[data-check-arrow]")!
        .getAttribute("points")!
        .split(" ")
        .map((p) => {
          const [x, y] = p.split(",").map(Number);
          const w = unproject("isometric", { x, y }, PIPE_AXIS_Z);
          return (w.x - 0.5) * d.x + (w.y - 0.5) * d.y;
        });
      // The tip 0.52 of a cell downstream, the two base corners 0.3.
      expect(along[0]).toBeCloseTo(0.52, 2);
      expect(along[1]).toBeCloseTo(0.3, 2);
      expect(along[2]).toBeCloseTo(0.3, 2);
    }
  });

  it("paints the far head of a double pump first, whichever way its run goes", () => {
    for (const d of RUN_DIRECTIONS) {
      const heads = [
        ...iso("pump_double", { direction: d }).querySelectorAll(
          "[data-volume='cylinder'] ellipse",
        ),
      ].map((e) => Number(e.getAttribute("cy")));
      expect(heads).toHaveLength(2);
      // Nearer the viewer is lower on the screen: the head painted first
      // stands higher, so the near one covers it.
      expect(heads[0]).toBeLessThan(heads[1]);
    }
  });

  it("glows the loop heater's element while it heats, red on a fault, muted else", () => {
    const element = (state?: SymbolState, faulty = false) =>
      iso("loop_heater", { state, faulty }).querySelector("[data-element]")!;
    expect(element("on").getAttribute("data-element")).toBe("on");
    expect(element("on").getAttribute("class")).toBe(
      "stroke-fluid-heating-supply",
    );
    expect(element("off").getAttribute("class")).toBe(
      "stroke-muted-foreground",
    );
    expect(element().getAttribute("class")).toBe("stroke-muted-foreground");
    expect(element("on", true).getAttribute("class")).toBe(
      "stroke-status-error",
    );
  });

  it("writes kWh on the meter's register, along the run", () => {
    const c = iso("energy_meter", { label: "CPT-01" });
    const register = [...c.querySelectorAll("text")].find(
      (t) => t.textContent === "kWh",
    )!;
    expect(register.getAttribute("class")).toBe("fill-synoptic-reading");
    expect(register.getAttribute("transform")).toMatch(/^rotate\(26\.57 /);
    expect(c.querySelector("[data-volume='box']")).not.toBeNull();
  });

  it("gives the link a card face on a shadow with a stub down to the floor", () => {
    const c = iso("link");
    expect(c.querySelectorAll("[data-link-face]")).toHaveLength(1);
    expect(c.querySelectorAll("polygon[fill-opacity='0.1']")).toHaveLength(1);
    expect(c.querySelectorAll("[data-volume='tube']")).toHaveLength(1);
    expect(c.querySelector("polygon.fill-synoptic-plate")).toBeNull();
  });

  it("hangs the expansion vessel's ball on its stub, painted with the vessel gradient", () => {
    const c = iso("expansion_vessel");
    expect(
      c.querySelector("[data-volume='sphere']")!.getAttribute("fill"),
    ).toBe("url(#syn-vessel)");
    expect(c.querySelectorAll("[data-volume='tube']")).toHaveLength(1);
    expect(c.querySelectorAll("[data-volume='shadow']")).toHaveLength(1);
  });

  it("colours a machine's active part by its fault first, then its run state", () => {
    expect(indication(undefined, false)).toBe("unknown");
    expect(indication("on", false)).toBe("on");
    expect(indication("off", false)).toBe("off");
    expect(indication("on", true)).toBe("fault");
    expect(indication(undefined, true)).toBe("fault");
  });
});

describe("symbolLabelAnchor", () => {
  it("puts a link's caption beside the tip of its arrow in isometric, reading away from it", () => {
    // Pointing -x, the tip is the leftmost point on screen: the caption
    // ends 8 px left of it, 4 px under the tip's line.
    const tip = project("isometric", 0.05, 1, PIPE_AXIS_Z);
    expect(symbolLabelAnchor("link", "isometric", { x: 0, y: 0 })).toEqual({
      at: { x: tip.x - 8, y: tip.y + 4 },
      anchor: "end",
      onFace: false,
    });
    // Turned twice, the tip points +x and is the rightmost point: the
    // caption starts 8 px right of it.
    const turned = project("isometric", 0.95, 0, PIPE_AXIS_Z);
    const back = symbolLabelAnchor("link", "isometric", { x: 0, y: 0 }, 2)!;
    expect(back.anchor).toBe("start");
    expect(back.onFace).toBe(false);
    expect(back.at.x).toBeCloseTo(turned.x + 8);
    expect(back.at.y).toBeCloseTo(turned.y + 4);
  });

  it("writes a link's caption on its face on the sheet, and names nothing it cannot draw", () => {
    expect(symbolLabelAnchor("link", "flat", { x: 0, y: 0 })).toEqual({
      at: { x: 20, y: 40 },
      anchor: "middle",
      onFace: true,
    });
    expect(symbolLabelAnchor("reactor", "flat", { x: 0, y: 0 })).toBeNull();
  });
});

describe("collectorLabelAnchor", () => {
  const shape = (axis: "x" | "y") => ({ axis, length: 4, ports: {} });

  it("levels the name 14 px above the origin cell on the sheet", () => {
    expect(collectorLabelAnchor("flat", { x: 1, y: 1 }, shape("x"))).toEqual({
      at: { x: 60, y: 46 },
      angle: 0,
      anchor: "middle",
    });
  });

  it("starts the name a third of a cell along the bar in isometric, turned to its axis", () => {
    expect(ISO_AXIS_DEG).toBeCloseTo(26.565, 3);
    const x = collectorLabelAnchor("isometric", { x: 1, y: 1 }, shape("x"));
    expect(x.anchor).toBe("start");
    expect(x.angle).toBeCloseTo(26.565, 3);
    // 0.3 of a cell along x from the origin cell's centre, 0.55 of a cell
    // above the pipe axis.
    expect(x.at.x).toBeCloseTo(7.2);
    expect(x.at.y).toBeCloseTo(16.8);
    const y = collectorLabelAnchor("isometric", { x: 1, y: 1 }, shape("y"));
    expect(y.angle).toBeCloseTo(-26.565, 3);
    expect(y.at.x).toBeCloseTo(-7.2);
    expect(y.at.y).toBeCloseTo(16.8);
  });

  it("renders level on the sheet and turned along the bar in isometric", () => {
    const flat = draw(
      <Collector
        projection="flat"
        origin={{ x: 1, y: 1 }}
        shape={shape("x")}
        label="N-1"
      />,
    ).querySelector("text")!;
    expect(flat.hasAttribute("data-axis-label")).toBe(false);
    expect(flat.getAttribute("transform")).toBeNull();
    expect([flat.getAttribute("x"), flat.getAttribute("y")]).toEqual([
      "60",
      "46",
    ]);
    const iso = draw(
      <Collector
        projection="isometric"
        origin={{ x: 1, y: 1 }}
        shape={shape("y")}
        label="N-1"
      />,
    ).querySelector("text[data-axis-label]")!;
    expect(iso.getAttribute("transform")).toMatch(/^rotate\(-26\.57 /);
    expect(iso.getAttribute("text-anchor")).toBe("start");
  });

  it("caps the bar's tube at the ends of the bar only, each cell's piece butt-ended", () => {
    const cells = [
      ...draw(
        <Collector
          projection="isometric"
          origin={{ x: 1, y: 1 }}
          shape={shape("x")}
        />,
      ).querySelectorAll("[data-collector-cell]"),
    ];
    expect(
      cells.map((cell) => cell.querySelectorAll("ellipse").length),
    ).toEqual([1, 0, 0, 1]);
    for (const cell of cells) {
      const strokes = [...cell.querySelectorAll("path")];
      expect(strokes).toHaveLength(2);
      expect(strokes.map((p) => p.getAttribute("stroke-linecap"))).toEqual([
        "butt",
        "butt",
      ]);
    }
    // A bar of one cell has no length to cap: one cap at its point.
    expect(
      draw(
        <Collector
          projection="isometric"
          origin={{ x: 0, y: 0 }}
          shape={{ ...shape("y"), length: 1 }}
        />,
      ).querySelectorAll("[data-collector-cell] ellipse"),
    ).toHaveLength(1);
  });
});
