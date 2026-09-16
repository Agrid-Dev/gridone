import { describe, expect, it } from "vitest";
import { depthKey, project } from "./projection";

describe("project", () => {
  it("maps the isometric axes to the 2:1 dimetric vectors", () => {
    expect(project("isometric", 0, 0)).toEqual({ x: 0, y: 0 });
    expect(project("isometric", 1, 0, 0)).toEqual({ x: 40, y: 20 });
    expect(project("isometric", 0, 1, 0)).toEqual({ x: -40, y: 20 });
    expect(project("isometric", 0, 0, 1)).toEqual({ x: 0, y: -40 });
    expect(project("isometric", 2, 1, 1)).toEqual({ x: 40, y: 20 });
  });

  it("maps flat cells to 48 px squares and ignores z", () => {
    expect(project("flat", 0, 0)).toEqual({ x: 0, y: 0 });
    expect(project("flat", 2, 1, 5)).toEqual({ x: 96, y: 48 });
  });

  it("projects fractional cell centres", () => {
    expect(project("isometric", 0.5, 0.5)).toEqual({ x: 0, y: 20 });
  });
});

describe("depthKey", () => {
  const tank = depthKey({ x: 2, y: 2 }, "symbol");

  it("paints a run crossing behind a body before it and one in front after", () => {
    expect(depthKey({ x: 2, y: 1 }, "pipe")).toBeLessThan(tank);
    expect(depthKey({ x: 2, y: 3 }, "pipe")).toBeGreaterThan(tank);
  });

  it("paints a raised run over the body it climbs", () => {
    expect(depthKey({ x: 2, y: 2, z: 1 }, "pipe")).toBeGreaterThan(tank);
  });

  it("defaults z to 0", () => {
    expect(depthKey({ x: 1, y: 1 }, "pipe")).toBe(
      depthKey({ x: 1, y: 1, z: 0 }, "pipe"),
    );
  });

  it("orders pipe under symbol within one cell", () => {
    const pipe = depthKey({ x: 2, y: 2 }, "pipe");
    expect(pipe).toBeLessThan(tank);
    expect(tank).toBeLessThan(depthKey({ x: 3, y: 2 }, "pipe"));
  });

  it("paints every label after every body, in cell order among labels", () => {
    // A chip hung above its cell at (2,2) reaches into the tank at (3,2):
    // the tank is nearer, the chip must still be on top.
    const chip = depthKey({ x: 2, y: 2 }, "label");
    expect(chip).toBeGreaterThan(tank);
    expect(chip).toBeGreaterThan(depthKey({ x: 40, y: 40, z: 3 }, "symbol"));
    expect(chip).toBeLessThan(depthKey({ x: 3, y: 2 }, "label"));
  });
});
