/**
 * Materials of the building's massing — slabs, structure, furniture and the
 * glazed envelope. Each storey gets its own set so a level can fade on its
 * own; the frame loop is their single writer, through `applyGhost`.
 */
import { Color, MeshStandardMaterial } from "three";
import { makeFacadeMaterial } from "./facadeMaterial";
import type { GeometryCategory } from "./sceneContract";
import type { ViewerTheme } from "./themeColors";

export type CategoryMaterials = Record<GeometryCategory, MeshStandardMaterial>;

const FURNITURE_COLOR = "#b7b1a3";
const STRUCTURE_OPACITY = 0.07;
/** Facade opacity with the storeys stacked, and with them pulled apart. */
const ENVELOPE_OPACITY_SOLID = 0.94;
const ENVELOPE_OPACITY_OPEN = 0.12;

/**
 * Stage materials of one storey. They are transparent from the start — even
 * at full opacity — so isolating a level can fade them without toggling
 * `transparent`, which would force a shader recompile mid-animation.
 */
export function makeCategoryMaterials(): CategoryMaterials {
  return {
    slab: new MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.85,
      transparent: true,
      opacity: 1,
      envMapIntensity: 0.3,
    }),
    structure: new MeshStandardMaterial({
      metalness: 0,
      roughness: 0.4,
      transparent: true,
      opacity: STRUCTURE_OPACITY,
      depthWrite: false,
      envMapIntensity: 0.25,
    }),
    furniture: new MeshStandardMaterial({
      color: new Color(FURNITURE_COLOR),
      metalness: 0,
      roughness: 0.8,
      transparent: true,
      opacity: 1,
      envMapIntensity: 0.5,
    }),
    envelope: makeFacadeMaterial(),
  };
}

/** Stage colours follow the app theme (light scene in light mode). */
export function applyStageTheme(
  materials: CategoryMaterials,
  stage: ViewerTheme["stage"],
): void {
  materials.slab.color = new Color(stage.slab);
  materials.structure.color = new Color(stage.structure);
  materials.envelope.color = new Color(stage.envelope);
}

/**
 * Presence of one storey's stage geometry for this frame.
 *
 * `factor` is the storey's ghost presence, `stage` how much the massing keeps
 * while a room is selected, `facade` the facade layer's presence. `spread`
 * also drives the envelope: a whole building shows its facade, an exploded
 * one has to let the rooms through, so the skin dissolves exactly as the
 * storeys separate.
 */
export function applyGhost(
  materials: CategoryMaterials,
  factor: number,
  spread: number,
  facade: number,
  stage: number,
): void {
  materials.slab.opacity = factor * stage;
  materials.furniture.opacity = factor * stage;
  materials.structure.opacity = STRUCTURE_OPACITY * factor * stage;

  const envelope = materials.envelope;
  // Below a pixel of presence the skin is off, not merely faint: leaving it
  // in the transparent pass would keep costing draw calls and sorting.
  envelope.visible = facade > 0.01;
  envelope.opacity =
    (ENVELOPE_OPACITY_SOLID +
      (ENVELOPE_OPACITY_OPEN - ENVELOPE_OPACITY_SOLID) * spread) *
    factor *
    facade;
  // A whole, unfocused building shows a genuinely opaque skin: a transparent
  // shell enclosing the whole scene cannot occlude it reliably, because
  // back-to-front sorting works on centroids and every room shares the
  // facade's. Separating the storeys — or picking a room — turns it back into
  // glass so the interior comes through.
  const opaque = spread < 0.05 && factor > 0.99 && facade > 0.99;
  if (envelope.transparent === opaque) {
    envelope.transparent = !opaque;
    envelope.depthWrite = opaque;
    envelope.needsUpdate = true;
  }
}
