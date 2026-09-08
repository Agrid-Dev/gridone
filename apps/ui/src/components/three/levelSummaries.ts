/**
 * Flattens the parsed scene + live room states into the rows the Levels panel
 * renders. Pure data, so the panel component stays free of three.js.
 */
import type { ConnectionStatus } from "@/lib/devices";
import type { Severity } from "@/lib/severity";
import type { RoomState } from "./roomStates";
import type { SceneStorey } from "./sceneContract";

export type ZoneSummary = {
  globalId: string;
  name: string;
  temperature: number | null;
  severity: Severity | null;
  objectType: string | null;
  connection: ConnectionStatus | null;
};

export type LevelSummary = {
  globalId: string;
  name: string;
  /** Compact label for the collapsed rail — see `shortLabel`. */
  short: string;
  index: number;
  zoneCount: number;
  alertCount: number;
  zones: ZoneSummary[];
};

/** Where a room of the model sits — how devices and faults reach a space. */
export type RoomLocation = {
  globalId: string;
  roomName: string;
  levelName: string;
  levelIndex: number;
};

/**
 * The model's rooms by asset id, which is how devices and faults reference
 * them. A room no level lists is left out on purpose: nothing can fly to a
 * storey the rail does not carry, so its devices read as off-model.
 */
export function indexRoomsByAsset(
  roomStates: Map<string, RoomState>,
  levels: LevelSummary[],
): Map<string, RoomLocation> {
  const levelOf = new Map<string, LevelSummary>();
  for (const level of levels) {
    for (const zone of level.zones) {
      levelOf.set(zone.globalId, level);
    }
  }
  const index = new Map<string, RoomLocation>();
  for (const state of roomStates.values()) {
    const level = levelOf.get(state.globalId);
    if (state.assetId && level) {
      index.set(state.assetId, {
        globalId: state.globalId,
        roomName: state.name,
        levelName: level.name,
        levelIndex: level.index,
      });
    }
  }
  return index;
}

/**
 * Rail label: storey names are usually already short ("RDC", "R+1"), so keep
 * them as-is up to 4 characters and fall back to the ordinal otherwise —
 * language-neutral, and the full name stays in the button's accessible name.
 */
export function shortLabel(name: string, index: number): string {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 4 ? trimmed : String(index);
}

/** Levels ordered highest first, so the list mirrors the building. */
export function buildLevelSummaries(
  storeys: SceneStorey[],
  roomStates: Map<string, RoomState>,
): LevelSummary[] {
  return [...storeys]
    .sort((a, b) => b.index - a.index)
    .map((storey) => {
      const zones: ZoneSummary[] = storey.spaces
        .map((space) => {
          const state = roomStates.get(space.globalId);
          return {
            globalId: space.globalId,
            name: state?.name ?? space.name,
            temperature: state?.temperature ?? null,
            severity: state?.severity ?? null,
            objectType: state?.objectType ?? null,
            connection: state?.connection ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const name = storey.name.trim() || `L${storey.index}`;
      return {
        globalId: storey.globalId,
        name,
        short: shortLabel(storey.name, storey.index),
        index: storey.index,
        zoneCount: zones.length,
        alertCount: zones.filter((zone) => zone.severity === "alert").length,
        zones,
      };
    });
}
