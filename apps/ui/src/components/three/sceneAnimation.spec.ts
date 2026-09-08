import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { facadeUniforms } from "./facadeMaterial";
import {
  approach,
  easeDelta,
  easeLayout,
  easeStoreys,
  initialMotion,
  paintSpaces,
} from "./sceneAnimation";
import { parseBuildingScene } from "./sceneContract";
import { buildSceneLayout } from "./sceneLayout";
import { markerOf, type SpaceStyle } from "./spaceMaterials";

/** A frame long enough for every easing to land in one step. */
const SETTLE_DT = 1;

/** Two storeys of one slab and one room each. */
function makeBuilding() {
  const root = new Group();
  const rooms: Mesh[] = [];
  [0, 1].forEach((index) => {
    const storey = new Object3D();
    storey.userData = {
      kind: "storey",
      global_id: `st-${index}`,
      name: `L${index}`,
      elevation: index * 3,
      index,
    };
    const slabNode = new Object3D();
    slabNode.userData = { kind: "geometry", category: "slab" };
    const slab = new Mesh(new BoxGeometry(10, 0.3, 8));
    slab.position.y = index * 3;
    slabNode.add(slab);
    const spaceNode = new Object3D();
    spaceNode.userData = { kind: "space", global_id: `sp-${index}` };
    const room = new Mesh(new BoxGeometry(4, 2.7, 4));
    room.position.y = index * 3 + 1.5;
    rooms.push(room);
    spaceNode.add(room);
    storey.add(slabNode, spaceNode);
    root.add(storey);
  });
  const parsed = parseBuildingScene(root);
  const layout = buildSceneLayout(root, parsed);
  return { parsed, layout, rooms };
}

function styleOf(storeyId: string, overrides: Partial<SpaceStyle> = {}) {
  return {
    color: new Color(0.2, 0.7, 0.8),
    opacity: 0.14,
    emissiveIntensity: 0.25,
    edgeOpacity: 0.75,
    alert: false,
    selected: false,
    hasDevices: false,
    storeyId,
    ...overrides,
  };
}

const REST = { focusedStoreyId: null, selectedId: null, planish: false };

describe("approach", () => {
  it("eases toward the goal and snaps onto it once close enough", () => {
    expect(approach(0, 1, 0.5)).toBe(0.5);
    expect(approach(0.999, 1, 0.5)).toBe(1);
    expect(approach(1, 1, 0.5)).toBe(1);
  });
});

describe("easeDelta", () => {
  it("caps the frame delta after an idle stretch", () => {
    expect(easeDelta(0.016)).toBe(0.016);
    expect(easeDelta(2)).toBe(0.1);
  });
});

describe("easeLayout", () => {
  it("lifts the storeys apart as the explode spreads, then rests", () => {
    const { parsed, layout } = makeBuilding();
    const motion = initialMotion(false, true);
    const goals = { exploded: true, showFacade: true, planish: false };

    expect(easeLayout(motion, 0.05, goals, parsed.storeys, layout.gap)).toBe(
      true,
    );
    expect(motion.spread).toBeCloseTo(0.2);
    expect(parsed.storeys[1].object.position.y).toBeGreaterThan(0);

    expect(
      easeLayout(motion, SETTLE_DT, goals, parsed.storeys, layout.gap),
    ).toBe(false);
    expect(motion.spread).toBe(1);
    expect(parsed.storeys[0].object.position.y).toBe(0);
    expect(parsed.storeys[1].object.position.y).toBe(layout.gap);
  });

  it("dissolves the facade while plan-ish, whatever the toggle says", () => {
    const { parsed, layout } = makeBuilding();
    const motion = initialMotion(false, true);
    easeLayout(
      motion,
      SETTLE_DT,
      { exploded: false, showFacade: true, planish: true },
      parsed.storeys,
      layout.gap,
    );
    expect(motion.facade).toBe(0);
  });
});

describe("easeStoreys", () => {
  it("ghosts the storeys that are not isolated, and their shadows with them", () => {
    const { parsed, layout } = makeBuilding();
    const motion = initialMotion(false, true);
    const goals = { ...REST, focusedStoreyId: "st-0" };
    const busy = easeStoreys(
      motion,
      SETTLE_DT,
      goals,
      parsed.storeys,
      layout,
      new Map(),
    );

    expect(busy).toBe(false);
    expect(motion.ghost.get("st-0")).toBe(1);
    expect(motion.ghost.get("st-1")).toBeCloseTo(0.16);
    expect(layout.storeyMaterials.get("st-1")?.slab.opacity).toBeCloseTo(0.16);
    expect(layout.shadowMeshes.get("st-0")?.[0].castShadow).toBe(true);
    expect(layout.shadowMeshes.get("st-1")?.[0].castShadow).toBe(false);
    expect(parsed.storeys[1].object.visible).toBe(true);
  });

  it("fades the other storeys out entirely in plan, and hides them once settled", () => {
    const { parsed, layout } = makeBuilding();
    const motion = initialMotion(false, true);
    const goals = { ...REST, focusedStoreyId: "st-0", planish: true };
    easeStoreys(motion, SETTLE_DT, goals, parsed.storeys, layout, new Map());

    expect(motion.ghost.get("st-1")).toBe(0);
    expect(parsed.storeys[1].object.visible).toBe(false);
    expect(parsed.storeys[0].object.visible).toBe(true);
  });

  it("steps the stage back around a selection, less so in plan", () => {
    const { parsed, layout } = makeBuilding();
    const slab = layout.storeyMaterials.get("st-0")!.slab;

    const motion3d = initialMotion(false, true);
    easeStoreys(
      motion3d,
      SETTLE_DT,
      { ...REST, selectedId: "sp-0" },
      parsed.storeys,
      layout,
      new Map(),
    );
    expect(motion3d.open).toBe(1);
    expect(slab.opacity).toBeCloseTo(0.32);

    const motionPlan = initialMotion(false, true);
    easeStoreys(
      motionPlan,
      SETTLE_DT,
      { ...REST, selectedId: "sp-0", planish: true },
      parsed.storeys,
      layout,
      new Map(),
    );
    expect(slab.opacity).toBeCloseTo(0.75);
  });

  it("anchors the facade grid to the travelling storey and lights its share", () => {
    const { parsed, layout } = makeBuilding();
    const motion = initialMotion(true, true);
    easeLayout(
      motion,
      SETTLE_DT,
      { exploded: true, showFacade: true, planish: false },
      parsed.storeys,
      layout.gap,
    );
    easeStoreys(
      motion,
      SETTLE_DT,
      REST,
      parsed.storeys,
      layout,
      new Map([["st-1", 0.8]]),
    );

    const uniforms = facadeUniforms(
      layout.storeyMaterials.get("st-1")!.envelope,
    )!;
    expect(uniforms.uBaseY.value).toBeCloseTo(
      layout.facade.get("st-1")!.baseY + layout.gap,
    );
    expect(uniforms.uFloorHeight.value).toBeCloseTo(3);
    expect(uniforms.uModule.value).toBe(layout.module);
    expect(uniforms.uSeed.value).toBe(1);
    expect(uniforms.uLit.value).toBe(0.8);
    // A storey with no share falls back to the default.
    const uniforms0 = facadeUniforms(
      layout.storeyMaterials.get("st-0")!.envelope,
    )!;
    expect(uniforms0.uLit.value).toBe(0.42);
  });
});

describe("paintSpaces", () => {
  it("pushes every other room back behind the selection", () => {
    const { rooms } = makeBuilding();
    const motion = initialMotion(false, true);
    const targets = new Map([
      [rooms[0], styleOf("st-0", { selected: true, opacity: 0.62 })],
      [rooms[1], styleOf("st-1")],
    ]);
    const busy = paintSpaces(
      motion,
      SETTLE_DT,
      0,
      { selectedId: "sp-0", showMarkers: false, planish: false },
      targets,
    );

    expect(busy).toBe(false);
    expect((rooms[0].material as MeshStandardMaterial).opacity).toBeCloseTo(
      0.62,
    );
    expect((rooms[1].material as MeshStandardMaterial).opacity).toBeCloseTo(
      0.14 * 0.3,
    );
  });

  it("multiplies the storey's ghost into a room's presence", () => {
    const { rooms } = makeBuilding();
    const motion = initialMotion(false, true);
    motion.ghost.set("st-1", 0.5);
    paintSpaces(
      motion,
      SETTLE_DT,
      0,
      { selectedId: null, showMarkers: false, planish: false },
      new Map([[rooms[1], styleOf("st-1")]]),
    );
    expect((rooms[1].material as MeshStandardMaterial).opacity).toBeCloseTo(
      0.14 * 0.5,
    );
  });

  it("keeps the loop alive while an alert pulses, and shows its marker", () => {
    const { rooms } = makeBuilding();
    const motion = initialMotion(false, true);
    const marker = markerOf(rooms[0]);
    const targets = new Map([
      [rooms[0], styleOf("st-0", { alert: true, hasDevices: true })],
    ]);
    const busy = paintSpaces(
      motion,
      SETTLE_DT,
      0,
      { selectedId: null, showMarkers: true, planish: false },
      targets,
    );
    expect(busy).toBe(true);
    expect(marker.visible).toBe(true);
  });

  it("damps the glow in plan", () => {
    const { rooms } = makeBuilding();
    const motion = initialMotion(false, true);
    paintSpaces(
      motion,
      SETTLE_DT,
      0,
      { selectedId: null, showMarkers: false, planish: true },
      new Map([[rooms[0], styleOf("st-0")]]),
    );
    expect(
      (rooms[0].material as MeshStandardMaterial).emissiveIntensity,
    ).toBeCloseTo(0.25 * 0.45);
  });
});
