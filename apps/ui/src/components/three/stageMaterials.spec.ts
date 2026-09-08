import { describe, expect, it } from "vitest";
import { Color } from "three";
import { viewerThemeFixture } from "@/test/viewerTheme";
import {
  applyGhost,
  applyStageTheme,
  makeCategoryMaterials,
} from "./stageMaterials";

describe("makeCategoryMaterials", () => {
  it("builds every stage material transparent, so fading never recompiles", () => {
    const stage = makeCategoryMaterials();
    for (const material of Object.values(stage)) {
      expect(material.transparent).toBe(true);
    }
    expect(stage.structure.opacity).toBeLessThan(0.1);
  });
});

describe("applyStageTheme", () => {
  it("colours the massing from the theme's stage palette", () => {
    const stage = makeCategoryMaterials();
    applyStageTheme(stage, viewerThemeFixture.stage);
    expect(stage.slab.color.equals(new Color("#b0a094"))).toBe(true);
    expect(stage.structure.color.equals(new Color("#8b7777"))).toBe(true);
    expect(stage.envelope.color.equals(new Color("#9fadbd"))).toBe(true);
  });
});

describe("applyGhost", () => {
  it("keeps the skin opaque on a whole, unfocused building", () => {
    const stage = makeCategoryMaterials();
    applyGhost(stage, 1, 0, 1, 1);
    expect(stage.envelope.visible).toBe(true);
    expect(stage.envelope.transparent).toBe(false);
    expect(stage.envelope.depthWrite).toBe(true);
  });

  it("turns the skin to glass as the building opens", () => {
    const stage = makeCategoryMaterials();
    applyGhost(stage, 1, 1, 1, 1);
    expect(stage.envelope.transparent).toBe(true);
    expect(stage.envelope.depthWrite).toBe(false);
    expect(stage.envelope.opacity).toBeLessThan(0.2);
  });

  it("stops rendering the skin once it is toggled off", () => {
    const stage = makeCategoryMaterials();
    applyGhost(stage, 1, 0, 0, 1);
    expect(stage.envelope.visible).toBe(false);
  });

  it("steps the stage back while a room is selected", () => {
    const stage = makeCategoryMaterials();
    applyGhost(stage, 1, 1, 1, 0.32);
    expect(stage.slab.opacity).toBeCloseTo(0.32);
    expect(stage.furniture.opacity).toBeCloseTo(0.32);
  });

  it("ghosts a storey that is not the isolated one", () => {
    const stage = makeCategoryMaterials();
    applyGhost(stage, 0.16, 0, 1, 1);
    expect(stage.slab.opacity).toBeCloseTo(0.16);
    // Still not opaque: an isolated level must be visible through the skin.
    expect(stage.envelope.transparent).toBe(true);
  });
});
