import { describe, expect, it } from "vitest";
import { DUCT_HEIGHT } from "@/components/synoptic/duct";
import { ahuLayout, COIL_LOOP_HEIGHT } from "./layout";

describe("ahuLayout", () => {
  it("keeps the plain double-flux geometry for short blocks", () => {
    expect(
      ahuLayout({ extractLines: 1, supplyLines: 2, coilLoop: false }),
    ).toEqual({ extractY: 70, supplyY: 184, height: 310 });
  });

  it("pushes the ducts apart when the two stream blocks would overlap", () => {
    const tall = ahuLayout({
      extractLines: 7,
      supplyLines: 8,
      coilLoop: false,
    });
    const extractBottom = tall.extractY + DUCT_HEIGHT / 2 + (7 * 20) / 2;
    const supplyTop = tall.supplyY + DUCT_HEIGHT / 2 - (8 * 20) / 2;
    expect(supplyTop - extractBottom).toBeGreaterThanOrEqual(24);
    expect(tall.height).toBeGreaterThanOrEqual(supplyTop + 8 * 20 + 12);
  });

  it("reserves a band under the supply duct for a coil water loop", () => {
    const plain = ahuLayout({
      extractLines: 1,
      supplyLines: 1,
      coilLoop: false,
    });
    const loop = ahuLayout({ extractLines: 1, supplyLines: 1, coilLoop: true });
    expect(loop.supplyY).toBe(plain.supplyY);
    expect(loop.height).toBe(
      loop.supplyY + DUCT_HEIGHT + COIL_LOOP_HEIGHT + 12,
    );
  });

  it("lays a supply-only unit out from the top", () => {
    expect(
      ahuLayout({ extractLines: 0, supplyLines: 2, coilLoop: false }),
    ).toEqual({ extractY: 0, supplyY: 44, height: 170 });
  });
});
