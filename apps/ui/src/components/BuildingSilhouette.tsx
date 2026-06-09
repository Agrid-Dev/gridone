import { CSSProperties, FC } from "react";
import { cn } from "@/lib/utils";

const FOOTPRINT = 280; // px — the box footprint side (also the inter-face depth)
const HALF = FOOTPRINT / 2;

// Floor slabs (horizontal) + structural edges (vertical), 1px lines in
// currentColor so the whole silhouette inherits one faint, theme-aware tint.
const faceStyle: CSSProperties = {
  backgroundImage: [
    "repeating-linear-gradient(to bottom, currentColor 0 1px, transparent 1px 32px)",
    "repeating-linear-gradient(to right, currentColor 0 1px, transparent 1px 70px)",
  ].join(", "),
};

/** A wireframe building drawn in CSS 3D: two faces meeting at a near vertical
 *  corner, each ruled with horizontal floor lines and vertical edge lines.
 *  Purely decorative — a faint, theme-adaptive, full-height backdrop. The host
 *  controls placement/sizing via `className` (e.g. `fixed inset-0 -z-10`). */
export const BuildingSilhouette: FC<{ className?: string }> = ({
  className,
}) => (
  <div
    aria-hidden="true"
    className={cn(
      "pointer-events-none select-none overflow-hidden [perspective-origin:70%_100%] [perspective:1800px]",
      className,
    )}
    style={{ color: "hsl(var(--foreground) / 0.05)" }}
  >
    <div
      className="absolute bottom-0 right-[6%] h-[120%] [transform-style:preserve-3d] [transform:rotateX(4deg)_rotateY(-30deg)]"
      style={{ width: FOOTPRINT }}
    >
      <div
        className="absolute inset-0 border border-current"
        style={{ ...faceStyle, transform: `translateZ(${HALF}px)` }}
      />
      <div
        className="absolute inset-0 border border-current"
        style={{
          ...faceStyle,
          transform: `rotateY(90deg) translateZ(${HALF}px)`,
        }}
      />
    </div>
  </div>
);
