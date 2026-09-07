/**
 * Procedural curtain wall for the building's outer envelope.
 *
 * The converted IFC carries no windows (most models don't) and no UVs, so the
 * facade grid is generated in the fragment shader from world position alone:
 * a module-wide, storey-high cell grid, each cell a glazed panel inside a
 * darker frame, a share of them lit from within.
 *
 * The horizontal coordinate is `x + z` rather than a per-wall tangent: on a
 * wall running along X the z term is constant and vice versa, so one
 * expression gives a continuous run along either orientation — a corner just
 * shifts the phase.
 */
import { Color, MeshStandardMaterial } from "three";

export type FacadeUniforms = {
  /** Warm interior light of a lit panel. */
  uWindow: { value: Color };
  /** Share of panels lit on this storey, 0..1. */
  uLit: { value: number };
  /** Glow strength of the lit panels. */
  uGlow: { value: number };
  /** Storey height in metres — the vertical pitch of the grid. */
  uFloorHeight: { value: number };
  /** World Y the grid starts from. */
  uBaseY: { value: number };
  /** Horizontal pitch of the grid in metres. */
  uModule: { value: number };
  /** Deterministic phase, so two storeys don't light the same panels. */
  uSeed: { value: number };
};

/** Warm light spilling from an occupied room. */
const WINDOW_COLOR = "#ffc98a";

const WORLD_POSITION_VARYING = "varying vec3 vFacadeWorld;";

/** Curtain walls hang off the slab, so lift the skin clear of its edges. */
const FACADE_OFFSET_M = 0.06;

/** Stable per-panel value — the same cell looks the same on every frame. */
const HASH_GLSL = /* glsl */ `
  float facadeHash(vec2 cell, float salt) {
    return fract(sin(dot(cell + salt, vec2(12.9898, 78.233))) * 43758.5453);
  }
`;

/**
 * Cell coordinates of the fragment. Alternate rows are offset by half a
 * module: a curtain wall reads as a rhythm, not as graph paper.
 */
const FACADE_CELL_GLSL = /* glsl */ `
  float fRow = (vFacadeWorld.y - uBaseY) / uFloorHeight;
  float fRowIndex = floor(fRow);
  float fCol = (vFacadeWorld.x + vFacadeWorld.z) / uModule
             + mod(fRowIndex, 2.0) * 0.5;
  vec2 fCell = vec2(floor(fCol), fRowIndex);
  vec2 fUv = vec2(fract(fCol), fract(fRow));
  // Tall and narrow — roughly 1:2 — with a wide spandrel beside it.
  float fPane =
    step(0.10, fUv.x) * step(fUv.x, 0.58) *
    step(0.16, fUv.y) * step(fUv.y, 0.93);
  float fPresent = step(0.12, facadeHash(fCell, uSeed + 37.0));
  float fLit = step(facadeHash(fCell, uSeed), uLit) * fPane * fPresent;
`;

const FACADE_FRAGMENT = /* glsl */ `
  {
    ${FACADE_CELL_GLSL}
    vec3 glass = diffuseColor.rgb;
    // Three tones, the way a real facade reads: most panes dark, a few
    // catching the sky, a few lit from inside.
    float bright = step(0.74, facadeHash(fCell, uSeed + 11.0)) * (1.0 - fLit);
    vec3 pane = mix(glass * 0.72, glass * 1.85, bright);
    pane = mix(pane, uWindow, fLit * 0.92);
    // Glass is brighter where it looks at the sky.
    pane *= mix(0.86, 1.14, fUv.y);
    // Mullions and spandrel: the dark grid the panes sit in.
    diffuseColor.rgb = mix(glass * 0.32, pane, fPane * fPresent);
  }
`;

const FACADE_EMISSIVE = /* glsl */ `
  {
    ${FACADE_CELL_GLSL}
    totalEmissiveRadiance += uWindow * fLit * uGlow;
  }
`;

/**
 * A tinted-glass material whose fragment shader draws the window grid.
 * Uniforms are kept on `userData` so the frame loop can drive them.
 */
export function makeFacadeMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    metalness: 0.82,
    roughness: 0.12,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    // A metallic skin is only as good as what it reflects — the scene sets a
    // room environment map, and the facade leans on it harder than the stage.
    envMapIntensity: 1.15,
  });
  const uniforms: FacadeUniforms = {
    uWindow: { value: new Color(WINDOW_COLOR) },
    uLit: { value: 0.4 },
    uGlow: { value: 0.55 },
    uFloorHeight: { value: 3 },
    uBaseY: { value: 0 },
    uModule: { value: 1.6 },
    uSeed: { value: 0 },
  };
  material.userData.facade = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\n${WORLD_POSITION_VARYING}`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
  // Hang the skin off the slab: the IFC's outer walls are coplanar with the
  // floor plates, which otherwise z-fight through as bands at every level.
  transformed += normalize(objectNormal) * ${FACADE_OFFSET_M.toFixed(3)};
  vFacadeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
${WORLD_POSITION_VARYING}
uniform vec3 uWindow;
uniform float uLit;
uniform float uGlow;
uniform float uFloorHeight;
uniform float uBaseY;
uniform float uModule;
uniform float uSeed;
${HASH_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>${FACADE_FRAGMENT}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>${FACADE_EMISSIVE}`,
      );
  };
  // Without a distinct key three would reuse a plain standard-material program
  // and the injected chunks would never compile.
  material.customProgramCacheKey = () => "gridone-facade";
  return material;
}

/** The material's live uniforms, or null for a material built elsewhere. */
export function facadeUniforms(
  material: MeshStandardMaterial,
): FacadeUniforms | null {
  return (material.userData.facade as FacadeUniforms | undefined) ?? null;
}
