import type { GlyphSetDocument, PresentationV1 } from "./document";
import type { GlyphCell, LoadedGlyphSet, Size } from "./face";

/**
 * Resources of a presentation in the browser: the package's images are
 * fetched through the authenticated client and kept as Blob URLs for the
 * lifetime of the page. Glyph sets are built from
 * the document's cell metrics and the decoded size of their atlas. No URL
 * from the document is ever loaded directly: the document only names
 * asset ids, the server serves the bytes.
 */

export type AssetFetcher = (assetId: string) => Promise<Blob>;
export type ImageSizeReader = (blob: Blob) => Promise<Size>;

export type LoadedAssets = {
  assetUrl: (assetId: string) => string | undefined;
  glyphSet: (glyphSetId: string) => LoadedGlyphSet | undefined;
  /** Asset ids that could not be fetched or decoded. */
  missing: string[];
};

/** Decode an image blob to learn its pixel size (browser implementation). */
export async function readImageSize(blob: Blob): Promise<Size> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export function glyphSetFrom(
  spec: GlyphSetDocument,
  atlasUrl: string,
  atlasSize: Size,
): LoadedGlyphSet {
  const cells: Record<string, GlyphCell> = {};
  for (const [char, cell] of Object.entries(spec.cells)) {
    cells[char] = {
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      advance: cell.advance,
      offsetX: cell.offset_x,
      offsetY: cell.offset_y,
    };
  }
  return {
    atlasUrl,
    atlasSize,
    lineHeight: spec.line_height,
    baseLine: spec.base_line,
    cells,
    kerning: spec.kerning,
  };
}

/**
 * Fetch every asset the document declares and build its glyph sets. An
 * asset that fails is reported in `missing` rather than thrown: the caller
 * decides whether the face can render without it (the ADR says a missing
 * indispensable resource makes the whole presentation fall back).
 */
export async function loadPresentationAssets(
  document: PresentationV1,
  fetchAsset: AssetFetcher,
  imageSize: ImageSizeReader = readImageSize,
  createUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
): Promise<LoadedAssets> {
  const urls = new Map<string, string>();
  const sizes = new Map<string, Size>();
  const missing: string[] = [];
  await Promise.all(
    Object.keys(document.assets).map(async (id) => {
      try {
        const blob = await fetchAsset(id);
        sizes.set(id, await imageSize(blob));
        urls.set(id, createUrl(blob));
      } catch {
        missing.push(id);
      }
    }),
  );
  const glyphSets = new Map<string, LoadedGlyphSet>();
  for (const [id, spec] of Object.entries(document.glyph_sets ?? {})) {
    const url = urls.get(spec.asset);
    const size = sizes.get(spec.asset);
    if (url && size) glyphSets.set(id, glyphSetFrom(spec, url, size));
  }
  return {
    assetUrl: (id) => urls.get(id),
    glyphSet: (id) => glyphSets.get(id),
    missing: missing.sort(),
  };
}
