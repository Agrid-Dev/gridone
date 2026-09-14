import { describe, expect, it } from "vitest";
import {
  depthKey,
  portPoint,
  project,
  rotateQuarter,
  rotateSide,
} from "./projection";

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

  it("orders pipe, symbol, label within one cell", () => {
    const cell = { x: 2, y: 2 };
    const pipe = depthKey(cell, "pipe");
    const label = depthKey(cell, "label");
    expect(pipe).toBeLessThan(tank);
    expect(tank).toBeLessThan(label);
    expect(label).toBeLessThan(depthKey({ x: 3, y: 2 }, "pipe"));
  });
});

describe("rotateQuarter", () => {
  it("turns counter-clockwise about the origin cell", () => {
    expect(rotateQuarter({ x: 1, y: 0 }, 1)).toEqual({ x: 0, y: 1 });
    expect(rotateQuarter({ x: 0, y: 1 }, 1)).toEqual({ x: -1, y: 0 });
    expect(rotateQuarter({ x: 1, y: 2 }, 4)).toEqual({ x: 1, y: 2 });
    expect(rotateQuarter({ x: 1, y: 0 }, -1)).toEqual({ x: 0, y: -1 });
  });
});

describe("rotateSide", () => {
  it("turns the horizontal faces and leaves the vertical ones", () => {
    expect(rotateSide("+x", 1)).toBe("+y");
    expect(rotateSide("+y", 1)).toBe("-x");
    expect(rotateSide("-x", 2)).toBe("+x");
    expect(rotateSide("+z", 3)).toBe("+z");
  });
});

describe("portPoint", () => {
  it("is the centre of the face on the pipe axis", () => {
    expect(portPoint("isometric", { x: 0, y: 0 }, "+x")).toEqual({
      x: 20,
      y: 14,
    });
    expect(portPoint("flat", { x: 0, y: 0 }, "+y")).toEqual({ x: 24, y: 48 });
  });
});
