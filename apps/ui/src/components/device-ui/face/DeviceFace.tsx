import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { localize } from "@/lib/localizedText";
import { cn } from "@/lib/utils";
import type { BindingResolver } from "../conditions";
import { layoutFace, type PlacedLayer } from "./faceLayout";
import type {
  Box,
  DeviceFaceDocument,
  FaceAction,
  GlyphCell,
  LoadedGlyphSet,
} from "./types";

export type DeviceFaceProps = {
  document: DeviceFaceDocument;
  /** Value of a binding id; null/undefined when not known. */
  resolve: BindingResolver;
  /** Object URL of an asset id, or undefined while it is not available. */
  assetUrl: (assetId: string) => string | undefined;
  glyphSet: (glyphSetId: string) => LoadedGlyphSet | undefined;
  onAction: (action: FaceAction) => void;
  /** Runtime permissions and attribute availability, in addition to local locks. */
  canActivate?: (action: FaceAction) => boolean;
  /** BCP-47 tag used to resolve labels. */
  language: string;
  /** Called with the CSS scale applied to the face on every resize. */
  onScale?: (scale: number) => void;
  className?: string;
};

/**
 * Exact-geometry rendering surface of a driver presentation.
 *
 * The document is laid out in the device's own pixel grid (`view_box`) by
 * `layoutFace`, and the whole surface is scaled with a CSS transform to fit
 * its container, never above 1:1 (atlases are exported at native
 * resolution). Interactive zones are real buttons so they take focus, carry
 * an accessible name and honour the blocked state; their drawing stays in
 * the graphic layers underneath.
 */
export function DeviceFace({
  document,
  resolve,
  assetUrl,
  glyphSet,
  onAction,
  canActivate,
  language,
  onScale,
  className,
}: DeviceFaceProps) {
  const { width, height } = document.view_box;
  const [scale, setScale] = useState(1);
  const outerRef = useRef<HTMLDivElement>(null);

  const applyWidth = useCallback(
    (measured: number) => {
      // A zero width (not laid out yet, or jsdom) keeps the native scale.
      const next = measured > 0 ? Math.min(1, measured / width) : 1;
      setScale(next);
      onScale?.(next);
    },
    [width, onScale],
  );

  useLayoutEffect(() => {
    const node = outerRef.current;
    if (!node) return;
    applyWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) applyWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [applyWidth]);

  const layers = layoutFace({ document, resolve, glyphSet });

  return (
    <div
      ref={outerRef}
      role="group"
      aria-label={localize(document.label, language)}
      data-testid="device-face"
      className={cn("relative w-full", className)}
      style={{
        aspectRatio: `${width} / ${height}`,
        maxWidth: width,
        // The inner surface is scaled, so the outer box must claim the
        // scaled height itself.
        height: height * scale,
      }}
    >
      <div
        data-testid="device-face-surface"
        className="absolute left-0 top-0 overflow-hidden"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {layers.map((layer, index) => (
          <Layer
            key={index}
            layer={layer}
            assetUrl={assetUrl}
            onAction={onAction}
            canActivate={canActivate}
            language={language}
          />
        ))}
      </div>
    </div>
  );
}

type LayerProps = {
  layer: PlacedLayer;
  assetUrl: DeviceFaceProps["assetUrl"];
  onAction: DeviceFaceProps["onAction"];
  canActivate: DeviceFaceProps["canActivate"];
  language: string;
};

function Layer({
  layer,
  assetUrl,
  onAction,
  canActivate,
  language,
}: LayerProps) {
  switch (layer.kind) {
    case "rect":
      return (
        <div
          data-layer="rect"
          className="absolute"
          style={{
            ...boxStyle(layer.box),
            backgroundColor: layer.fill,
            borderRadius: layer.radius,
          }}
        />
      );
    case "image": {
      const url = assetUrl(layer.asset);
      // A missing asset renders nothing here; the presentation loader is
      // the one that decides whether the whole face must fall back.
      if (!url) return null;
      return (
        <img
          data-layer="image"
          alt=""
          src={url}
          draggable={false}
          className="absolute select-none"
          style={{ ...boxStyle(layer.box), objectFit: "fill" }}
        />
      );
    }
    case "glyph": {
      const label = layer.label ? localize(layer.label, language) : undefined;
      return (
        <div
          data-layer="glyph"
          role={label ? "img" : undefined}
          aria-label={label}
          aria-hidden={label ? undefined : true}
          className="absolute"
          style={{
            ...boxStyle(layer.box),
            backgroundColor: layer.color,
            ...maskStyle(layer.set, layer.cell, layer.box),
          }}
        />
      );
    }
    case "glyph-run":
      return <GlyphRun layer={layer} language={language} />;
    case "button": {
      const blocked = layer.blocked || canActivate?.(layer.action) === false;
      return (
        <button
          type="button"
          data-layer="button"
          aria-label={localize(layer.label, language)}
          aria-disabled={blocked || undefined}
          onClick={() => {
            if (!blocked) onAction(layer.action);
          }}
          className={cn(
            "absolute appearance-none rounded-sm border-0 bg-transparent p-0",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            blocked ? "cursor-not-allowed" : "cursor-pointer",
          )}
          style={boxStyle(layer.box)}
        />
      );
    }
  }
}

/**
 * A laid-out text run. The glyphs are positioned in view-box pixels inside
 * an optional clip box (the device's parent container), so a glyph the
 * device cuts at a container edge is cut here too.
 */
function GlyphRun({
  layer,
  language,
}: {
  layer: Extract<PlacedLayer, { kind: "glyph-run" }>;
  language: string;
}) {
  const name = layer.accessibleLabel
    ? localize(layer.accessibleLabel, language)
    : layer.spoken
      ? layer.text
      : undefined;
  const clip = layer.clip ?? { x: 0, y: 0, width: 0, height: 0 };
  const origin = layer.clip ? clip : { x: 0, y: 0 };
  return (
    <div
      data-layer="glyph-run"
      data-text={layer.text}
      role={name ? "img" : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      className={cn("absolute", layer.clip && "overflow-hidden")}
      style={
        layer.clip
          ? boxStyle(clip)
          : { left: 0, top: 0, width: 0, height: 0, overflow: "visible" }
      }
    >
      {layer.glyphs.map((glyph, index) => {
        const box = {
          x: glyph.x - origin.x,
          y: glyph.y - origin.y,
          width: glyph.cell.width,
          height: glyph.cell.height,
        };
        return (
          <div
            key={index}
            data-glyph={glyph.char}
            className="absolute"
            style={{
              ...boxStyle(box),
              backgroundColor: layer.color,
              ...maskStyle(layer.set, glyph.cell, box),
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Tint a character of the atlas through a CSS mask: the atlas is drawn as
 * the mask (alpha only) and the element's background provides the colour.
 * The mask is scaled so that the character's cell fills the layer box, which
 * keeps the atlas at its native size when the box equals the cell.
 */
function maskStyle(set: LoadedGlyphSet, cell: GlyphCell, box: Box) {
  const sx = box.width / cell.width;
  const sy = box.height / cell.height;
  const image = `url("${set.atlasUrl}")`;
  const size = `${set.atlasSize.width * sx}px ${set.atlasSize.height * sy}px`;
  const position = `${-cell.x * sx}px ${-cell.y * sy}px`;
  return {
    maskImage: image,
    maskSize: size,
    maskPosition: position,
    maskRepeat: "no-repeat",
    WebkitMaskImage: image,
    WebkitMaskSize: size,
    WebkitMaskPosition: position,
    WebkitMaskRepeat: "no-repeat",
  } as const;
}

function boxStyle(box: Box) {
  return { left: box.x, top: box.y, width: box.width, height: box.height };
}

export { localize };
