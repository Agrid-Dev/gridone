import type { MeterTreeVariant } from "@gridone/sdk";
import { Droplet, Zap, type LucideIcon } from "lucide-react";
import { BEND_RADIUS } from "@/components/synoptic/geometry";
import { FLUID_FILL_CLASS, FLUID_STROKE_CLASS } from "@/lib/fluidColors";
import {
  SEMANTIC_FILL_CLASS,
  SEMANTIC_STROKE_CLASS,
} from "@/lib/semanticColors";

/** How a variant's tree is drawn, after the diagrams of what it meters. */
export type VariantStyle = {
  stroke: string;
  fill: string;
  icon: LucideIcon;
  /** Elbow radius: an electrical single-line diagram turns at right angles, a
   *  pipe bends. */
  bend: number;
};

/** `null`: the default look, which draws with no variant style. */
const VARIANT_STYLE: Record<MeterTreeVariant, VariantStyle | null> = {
  default: null,
  electricity: {
    stroke: SEMANTIC_STROKE_CLASS.electricity,
    fill: SEMANTIC_FILL_CLASS.electricity,
    icon: Zap,
    bend: 0,
  },
  // The synoptics' cold-water pipe colour: one blue for one water network.
  water: {
    stroke: FLUID_STROKE_CLASS.cold_water,
    fill: FLUID_FILL_CLASS.cold_water,
    icon: Droplet,
    bend: BEND_RADIUS,
  },
};

/**
 * The style a variant draws with, or `null` for the default look. A variant
 * this bundle predates draws as the default too, but says so: `unknown`.
 */
export function resolveVariant(variant: string | undefined): {
  style: VariantStyle | null;
  unknown: boolean;
} {
  const key = variant ?? "default";
  // Own keys only: "constructor" is not a variant, whatever the prototype says.
  const known = Object.hasOwn(VARIANT_STYLE, key);
  return {
    style: known ? VARIANT_STYLE[key as MeterTreeVariant] : null,
    unknown: !known,
  };
}
