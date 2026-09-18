import { describe, expect, it } from "vitest";
import {
  depthKey,
  portPoint,
  project,
  rotateQuarter,
  rotateSide,
  unproject,
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

describe("unproject", () => {
  // Cells the real plates use: negative y, and a run raised to z 1.
  it.each([
    [{ x: 0, y: 0 }, 0],
    [{ x: 3, y: -1 }, 0],
    [{ x: 13, y: -1 }, 1],
    [{ x: 2.5, y: 4.25 }, 0],
  ])("inverts project for %j at z %i", (cell, z) => {
    const screen = project("isometric", cell.x, cell.y, z);
    const back = unproject("isometric", screen, z);
    expect(back.x).toBeCloseTo(cell.x);
    expect(back.y).toBeCloseTo(cell.y);
  });

  it("reads a raised point at grade as the cell one step back on both axes", () => {
    // In the 2:1 projection (13, -1, z 1) lands where (12, -2) lands at grade.
    const screen = project("isometric", 13, -1, 1);
    expect(unproject("isometric", screen, 0)).toEqual({ x: 12, y: -2 });
  });

  it("inverts flat cells and ignores z", () => {
    expect(unproject("flat", { x: 96, y: 48 }, 3)).toEqual({ x: 2, y: 1 });
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
