import type { ReactElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { symbolSchemas, type Projection } from "@gridone/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { Collector } from "./Collector";
import { DRAWINGS } from "./drawings";
import { SynopticSymbol } from "./SynopticSymbol";

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
      expect(c.querySelectorAll("polygon").length).toBeGreaterThan(0);
      expect(c.querySelector("[data-unknown-symbol]")).toBeNull();
    },
  );

  it("extrudes a body with height in isometric only", () => {
    const iso = draw(
      <SynopticSymbol
        type="tank"
        projection="isometric"
        origin={{ x: 0, y: 0 }}
      />,
    );
    expect(iso.querySelector(".fill-synoptic-body-x")).not.toBeNull();
    expect(iso.querySelector(".fill-synoptic-body-y")).not.toBeNull();
    const flat = draw(
      <SynopticSymbol type="tank" projection="flat" origin={{ x: 0, y: 0 }} />,
    );
    expect(flat.querySelector(".fill-synoptic-body-x")).toBeNull();
    // The footprint takes the body colour so it occludes the runs at its ports.
    expect(flat.querySelector("polygon")!.getAttribute("points")).toBe(
      "0,0 48,0 48,96 0,96",
    );
  });

  it("body-fills an inline glyph so it breaks the run", () => {
    const c = draw(
      <SynopticSymbol
        type="pump"
        projection="isometric"
        origin={{ x: 0, y: 0 }}
      />,
    );
    expect(c.querySelector("polygon")!.className.baseVal).toContain(
      "fill-synoptic-body",
    );
  });

  it("turns an inline glyph with its run", () => {
    const along = (d: { x: number; y: number }) =>
      draw(
        <SynopticSymbol
          type="pump"
          projection="flat"
          origin={{ x: 0, y: 0 }}
          direction={d}
        />,
      )
        .querySelectorAll("polygon")[2]!
        .getAttribute("points");
    expect(along({ x: 1, y: 0 })).not.toBe(along({ x: 0, y: 1 }));
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
    expect(bowtie("on")).toContain("fill-none");
    expect(bowtie()).toContain("fill-none");
  });

  it("labels above the body, with a run-state LED", () => {
    const led = (state?: "on" | "off", faulty = false) =>
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
    expect(first(at({ x: 1, y: 0 }))).toBe("48,0 144,0 144,96 48,96");
    // A quarter turn puts the 2 x 2 body on cells x in [-1, 1), y in [0, 2),
    // where `symbolPort` puts its ports.
    expect(first(at({ x: 0, y: 0 }, 1))).toBe("48,0 48,96 -48,96 -48,0");
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

  it("draws a bar along its axis on the pipe axis plane", () => {
    const c = draw(
      <Collector
        projection="flat"
        origin={{ x: 1, y: 1 }}
        shape={props}
        label="N-1"
      />,
    );
    expect(c.querySelector("polygon")!.getAttribute("points")).toBe(
      "48,62.4 240,62.4 240,81.6 48,81.6",
    );
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
      "14.4,0 33.6,0 33.6,96 14.4,96",
    );
  });
});
