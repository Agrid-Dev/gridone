import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import type { RoomState } from "./roomStates";
import type { SceneStorey } from "./sceneContract";
import { buildLevelSummaries, shortLabel } from "./levelSummaries";

function makeStorey(
  index: number,
  name: string,
  spaces: [string, string][],
): SceneStorey {
  return {
    globalId: `st-${index}`,
    name,
    elevation: index * 3,
    index,
    object: new Object3D(),
    spaces: spaces.map(([globalId, spaceName]) => ({
      globalId,
      name: spaceName,
      object: new Object3D(),
    })),
  };
}

function makeState(
  globalId: string,
  overrides: Partial<RoomState> = {},
): RoomState {
  return {
    globalId,
    assetId: `asset-${globalId}`,
    name: `Room ${globalId}`,
    temperature: null,
    severity: null,
    objectType: null,
    connection: null,
    devices: [],
    ...overrides,
  };
}

describe("shortLabel", () => {
  it.each([
    ["RDC", 0, "RDC"],
    ["R+1", 1, "R+1"],
    ["  R+2 ", 2, "R+2"],
  ])("keeps a short storey name (%s)", (name, index, expected) => {
    expect(shortLabel(name, index)).toBe(expected);
  });

  it.each([
    ["Rez-de-chaussée", 0, "0"],
    ["", 3, "3"],
    ["   ", 4, "4"],
  ])("falls back to the ordinal for %s", (name, index, expected) => {
    expect(shortLabel(name, index)).toBe(expected);
  });
});

describe("buildLevelSummaries", () => {
  const storeys = [
    makeStorey(0, "RDC", [["s3", "Hall"]]),
    makeStorey(2, "R+2", []),
    makeStorey(1, "R+1", [
      ["s1", "Chambre 102"],
      ["s2", "Chambre 101"],
    ]),
  ];

  it("orders levels highest first", () => {
    const levels = buildLevelSummaries(storeys, new Map());
    expect(levels.map((level) => level.name)).toEqual(["R+2", "R+1", "RDC"]);
  });

  it("counts the zones of each level", () => {
    const levels = buildLevelSummaries(storeys, new Map());
    expect(levels.map((level) => level.zoneCount)).toEqual([0, 2, 1]);
  });

  it("sorts zones by name and prefers the room asset name", () => {
    const roomStates = new Map([
      ["s1", makeState("s1", { name: "Bureau" })],
      ["s2", makeState("s2", { name: "Atelier" })],
    ]);
    const [, first] = buildLevelSummaries(storeys, roomStates);
    expect(first.zones.map((zone) => zone.name)).toEqual(["Atelier", "Bureau"]);
  });

  it("falls back to the scene name when no room state exists", () => {
    const [, first] = buildLevelSummaries(storeys, new Map());
    expect(first.zones.map((zone) => zone.name)).toEqual([
      "Chambre 101",
      "Chambre 102",
    ]);
    expect(first.zones[0].temperature).toBeNull();
    expect(first.zones[0].severity).toBeNull();
  });

  it("carries temperature and severity through, and counts alerts", () => {
    const roomStates = new Map([
      ["s1", makeState("s1", { temperature: 21.4, severity: "alert" })],
      ["s2", makeState("s2", { temperature: 19, severity: "warning" })],
    ]);
    const [, first] = buildLevelSummaries(storeys, roomStates);
    expect(first.alertCount).toBe(1);
    const alerting = first.zones.find((zone) => zone.globalId === "s1");
    expect(alerting).toMatchObject({ temperature: 21.4, severity: "alert" });
  });

  it("handles a storey with no space", () => {
    const [top] = buildLevelSummaries(storeys, new Map());
    expect(top).toMatchObject({ zoneCount: 0, alertCount: 0, zones: [] });
  });

  it("names an unnamed storey after its ordinal", () => {
    const [level] = buildLevelSummaries([makeStorey(7, "", [])], new Map());
    expect(level).toMatchObject({ name: "L7", short: "7" });
  });

  it("does not reorder the storeys it is given", () => {
    const input = [...storeys];
    buildLevelSummaries(input, new Map());
    expect(input.map((storey) => storey.index)).toEqual([0, 2, 1]);
  });
});
