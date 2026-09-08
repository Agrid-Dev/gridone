/**
 * The component itself needs a WebGL context jsdom does not have; the
 * writers covered here decide what the user actually sees, so they are worth
 * pinning down on bare three.js objects.
 */
import { describe, expect, it } from "vitest";
import type { Device } from "@gridone/sdk";
import {
  BoxGeometry,
  Color,
  DoubleSide,
  FrontSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { viewerThemeFixture } from "@/test/viewerTheme";
import type { RoomState } from "./roomStates";
import type { ParsedScene } from "./sceneContract";
import {
  applyMarkerStyle,
  applySpaceStyle,
  edgesOf,
  makeSpaceMaterial,
  markerOf,
  setSpaceSides,
  spaceStyleTargets,
  type SpaceStyle,
} from "./spaceMaterials";

/** A room as the layout hands it to the frame loop: fill material + outline. */
function makeRoom(): Mesh {
  const mesh = new Mesh(new BoxGeometry(4, 3, 5), makeSpaceMaterial());
  edgesOf(mesh);
  return mesh;
}

function styleOf(overrides: Partial<SpaceStyle> = {}): SpaceStyle {
  return {
    color: new Color(0.2, 0.7, 0.8),
    opacity: 0.14,
    emissiveIntensity: 0.25,
    edgeOpacity: 0.75,
    alert: false,
    selected: false,
    hasDevices: false,
    storeyId: "st-1",
    ...overrides,
  };
}

function edgeMaterialOf(mesh: Mesh): LineBasicMaterial {
  const edges = mesh.userData.edgesObject as LineSegments;
  return edges.material as LineBasicMaterial;
}

function materialOf(mesh: Mesh): MeshStandardMaterial {
  return mesh.material as MeshStandardMaterial;
}

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    globalId: "sp-1",
    assetId: "a1",
    name: "Room 101",
    temperature: 22,
    severity: null,
    objectType: null,
    connection: null,
    devices: [],
    ...overrides,
  };
}

/** One storey holding one or two rooms, the way `parseBuildingScene` sees it. */
function makeParsed(meshes: Map<string, Mesh>): ParsedScene {
  const spaces = [...meshes].map(([globalId, mesh]) => ({
    globalId,
    name: globalId,
    object: mesh,
  }));
  return {
    storeys: [
      {
        globalId: "st-1",
        name: "L1",
        elevation: 0,
        index: 0,
        object: new Object3D(),
        spaces,
      },
    ],
    unassigned: null,
    spaceStoreys: new Map(spaces.map((space) => [space.globalId, "st-1"])),
  };
}

describe("applySpaceStyle", () => {
  it("draws the selected room through whatever stands in front of it", () => {
    const mesh = makeRoom();
    applySpaceStyle(mesh, styleOf({ selected: true, opacity: 0.62 }), 1, 0);

    // A room sits inside slabs and a facade: without this it is invisible
    // however brightly it is lit.
    expect(materialOf(mesh).depthTest).toBe(false);
    expect(edgeMaterialOf(mesh).depthTest).toBe(false);
    expect(materialOf(mesh).opacity).toBeCloseTo(0.62);
  });

  it("leaves an unselected room behind the geometry, and dimmed", () => {
    const mesh = makeRoom();
    applySpaceStyle(mesh, styleOf(), 0.3, 0);

    expect(materialOf(mesh).depthTest).toBe(true);
    expect(materialOf(mesh).opacity).toBeCloseTo(0.14 * 0.3);
    expect(edgeMaterialOf(mesh).opacity).toBeCloseTo(0.75 * 0.3);
  });

  it("writes the outline the layout built and creates none of its own", () => {
    const mesh = makeRoom();
    applySpaceStyle(mesh, styleOf(), 1, 0);
    applySpaceStyle(mesh, styleOf(), 1, 0);
    expect(mesh.children).toHaveLength(1);

    // A mesh the layout never dressed simply has no outline to write.
    const bare = new Mesh(new BoxGeometry(1, 1, 1), makeSpaceMaterial());
    applySpaceStyle(bare, styleOf(), 1, 0);
    expect(bare.children).toHaveLength(0);
  });

  it("pulses an alerting room, unless it is the one selected", () => {
    const pulsing = makeRoom();
    const picked = makeRoom();
    applySpaceStyle(pulsing, styleOf({ alert: true }), 1, 1);
    applySpaceStyle(picked, styleOf({ alert: true, selected: true }), 1, 1);

    // At wave = 1 the pulse is at its peak, well above the resting glow.
    expect(materialOf(pulsing).emissiveIntensity).toBeCloseTo(0.9);
    expect(materialOf(picked).emissiveIntensity).toBeCloseTo(0.25);
  });

  it("damps the glow — pulse included — under an emissive scale", () => {
    const selected = makeRoom();
    const pulsing = makeRoom();
    applySpaceStyle(
      selected,
      styleOf({ selected: true, emissiveIntensity: 1, opacity: 0.62 }),
      1,
      0,
      0.45,
    );
    applySpaceStyle(pulsing, styleOf({ alert: true }), 1, 1, 0.45);

    // The plan looks straight at a room's whole floor face: full emissive
    // would bleach its colour into a white wash.
    expect(materialOf(selected).emissiveIntensity).toBeCloseTo(0.45);
    expect(materialOf(pulsing).emissiveIntensity).toBeCloseTo(0.9 * 0.45);
    // Opacity is untouched — only the glow is scaled.
    expect(materialOf(selected).opacity).toBeCloseTo(0.62);
  });
});

describe("applyMarkerStyle", () => {
  it("is a no-op on a room that never got a marker", () => {
    const mesh = makeRoom();
    applyMarkerStyle(mesh, styleOf({ hasDevices: true }), 1, 0, true);
    expect(mesh.userData.markerObject).toBeUndefined();
  });

  it("shows the marker only with the layer on, a device, and presence", () => {
    const mesh = makeRoom();
    const marker = markerOf(mesh);
    const style = styleOf({ hasDevices: true });

    applyMarkerStyle(mesh, style, 1, 0, false);
    expect(marker.visible).toBe(false);
    applyMarkerStyle(mesh, styleOf(), 1, 0, true);
    expect(marker.visible).toBe(false);
    // A ghosted storey takes its markers with it.
    applyMarkerStyle(mesh, style, 0.16, 0, true);
    expect(marker.visible).toBe(false);

    applyMarkerStyle(mesh, style, 1, 0, true);
    expect(marker.visible).toBe(true);
    expect(materialOf(marker).color.equals(style.color)).toBe(true);
    expect(materialOf(marker).opacity).toBeCloseTo(1);
  });

  it("pulses the marker of an alerting room", () => {
    const mesh = makeRoom();
    const marker = markerOf(mesh);
    applyMarkerStyle(
      mesh,
      styleOf({ hasDevices: true, alert: true }),
      1,
      1,
      true,
    );
    expect(materialOf(marker).emissiveIntensity).toBeCloseTo(1.2);
  });

  it("creates one marker per room, sitting at its centroid", () => {
    const mesh = makeRoom();
    expect(markerOf(mesh)).toBe(markerOf(mesh));
    // The outline the layout built, plus the marker — one of each.
    expect(mesh.children).toHaveLength(2);
    expect(markerOf(mesh).position.toArray()).toEqual([0, 0, 0]);
  });
});

describe("setSpaceSides", () => {
  it("flips the fills between single- and double-sided, once", () => {
    const mesh = makeRoom();
    expect(materialOf(mesh).side).toBe(FrontSide);

    setSpaceSides([mesh], true);
    expect(materialOf(mesh).side).toBe(DoubleSide);
    const version = materialOf(mesh).version;
    // Already double-sided: no recompile requested.
    setSpaceSides([mesh], true);
    expect(materialOf(mesh).version).toBe(version);

    setSpaceSides([mesh], false);
    expect(materialOf(mesh).side).toBe(FrontSide);
  });
});

describe("spaceStyleTargets", () => {
  const targetsFor = (
    meshes: Map<string, Mesh>,
    roomStates: Map<string, RoomState>,
    picks: { hoveredId?: string | null; selectedId?: string | null } = {},
  ) =>
    spaceStyleTargets({
      parsed: makeParsed(meshes),
      meshes,
      roomStates,
      theme: viewerThemeFixture,
      colorMode: "temperature",
      hoveredId: picks.hoveredId ?? null,
      selectedId: picks.selectedId ?? null,
    });

  it("styles a resting, a hovered and a selected room apart", () => {
    const resting = makeRoom();
    const hovered = makeRoom();
    const selected = makeRoom();
    const meshes = new Map([
      ["sp-1", resting],
      ["sp-2", hovered],
      ["sp-3", selected],
    ]);
    const targets = targetsFor(meshes, new Map(), {
      hoveredId: "sp-2",
      selectedId: "sp-3",
    });

    expect(targets.get(resting)).toMatchObject({
      opacity: 0.14,
      emissiveIntensity: 0.25,
      edgeOpacity: 0.75,
      selected: false,
      storeyId: "st-1",
    });
    expect(targets.get(hovered)).toMatchObject({
      emissiveIntensity: 0.6,
      edgeOpacity: 1,
    });
    expect(targets.get(hovered)?.opacity).toBeCloseTo(0.3);
    expect(targets.get(selected)).toMatchObject({
      opacity: 0.62,
      emissiveIntensity: 1,
      selected: true,
    });
  });

  it("flags alerts and devices, and grows a marker for a room with devices", () => {
    const quiet = makeRoom();
    const alerting = makeRoom();
    const meshes = new Map([
      ["sp-1", quiet],
      ["sp-2", alerting],
    ]);
    const roomStates = new Map([
      ["sp-1", roomState({ globalId: "sp-1" })],
      [
        "sp-2",
        roomState({
          globalId: "sp-2",
          severity: "alert",
          devices: [{ id: "d1" } as Device],
        }),
      ],
    ]);
    const targets = targetsFor(meshes, roomStates);

    expect(targets.get(quiet)).toMatchObject({
      alert: false,
      hasDevices: false,
      opacity: 0.14,
    });
    expect(quiet.userData.markerObject).toBeUndefined();
    expect(targets.get(alerting)).toMatchObject({
      alert: true,
      hasDevices: true,
      // An alerting room rests brighter than a quiet one.
      opacity: 0.34,
    });
    expect(alerting.userData.markerObject).toBeDefined();
  });

  it("skips spaces the layout has no mesh for", () => {
    const mesh = makeRoom();
    const parsed = makeParsed(new Map([["sp-1", mesh]]));
    const targets = spaceStyleTargets({
      parsed,
      meshes: new Map(),
      roomStates: new Map(),
      theme: viewerThemeFixture,
      colorMode: "temperature",
      hoveredId: null,
      selectedId: null,
    });
    expect(targets.size).toBe(0);
  });
});
