import { describe, expect, it, vi } from "vitest";
import { glyphSetFrom, loadPresentationAssets } from "../assets";
import type { PresentationV1 } from "../document";

const document: PresentationV1 = {
  schema_version: 1,
  requires: [],
  assets: {
    bezel: { path: "assets/bezel.png" },
    font: { path: "assets/font.png" },
  },
  glyph_sets: {
    lcd: {
      asset: "font",
      line_height: 18,
      base_line: 3,
      cells: {
        "1": {
          x: 12,
          y: 1,
          width: 5,
          height: 12,
          advance: 6,
          offset_x: 0,
          offset_y: 0,
        },
      },
      kerning: { "11": -1 },
    },
    orphan: { asset: "nope", line_height: 1, base_line: 0, cells: {} },
  },
  bindings: {},
  controls: {},
  page: { kind: "stack", children: [] },
};

const blobOf = (name: string) => new Blob([name], { type: "image/png" });

describe("loadPresentationAssets", () => {
  it("fetches every asset once and builds glyph sets from the decoded atlas size", async () => {
    const fetchAsset = vi.fn(async (id: string) => blobOf(id));
    const imageSize = vi.fn(async (blob: Blob) => ({
      width: blob.size * 10,
      height: 7,
    }));
    const assets = await loadPresentationAssets(
      document,
      fetchAsset,
      imageSize,
      (blob) => `blob:${blob.size}`,
    );
    expect(fetchAsset).toHaveBeenCalledTimes(2);
    expect(assets.missing).toEqual([]);
    expect(assets.assetUrl("bezel")).toBe("blob:5");
    expect(assets.assetUrl("unknown")).toBeUndefined();
    const lcd = assets.glyphSet("lcd");
    expect(lcd).toMatchObject({
      atlasUrl: "blob:4",
      atlasSize: { width: 40, height: 7 },
      lineHeight: 18,
      baseLine: 3,
      kerning: { "11": -1 },
    });
    expect(lcd?.cells["1"]).toEqual({
      x: 12,
      y: 1,
      width: 5,
      height: 12,
      advance: 6,
      offsetX: 0,
      offsetY: 0,
    });
    // A glyph set whose asset is not declared cannot be built.
    expect(assets.glyphSet("orphan")).toBeUndefined();
  });

  it("reports assets that fail to fetch or decode instead of throwing", async () => {
    const fetchAsset = vi.fn(async (id: string) => {
      if (id === "bezel") throw new Error("404");
      return blobOf(id);
    });
    const imageSize = vi.fn(async () => {
      throw new Error("not an image");
    });
    const assets = await loadPresentationAssets(
      document,
      fetchAsset,
      imageSize,
      () => "blob:x",
    );
    expect(assets.missing).toEqual(["bezel", "font"]);
    expect(assets.assetUrl("font")).toBeUndefined();
    expect(assets.glyphSet("lcd")).toBeUndefined();
  });
});

describe("glyphSetFrom", () => {
  it("maps snake_case metrics to the engine's cells", () => {
    const set = glyphSetFrom(document.glyph_sets!.lcd, "blob:a", {
      width: 81,
      height: 27,
    });
    expect(set.cells["1"].offsetX).toBe(0);
    expect(set.atlasSize).toEqual({ width: 81, height: 27 });
  });
});
